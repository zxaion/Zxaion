import { PACK_PRICES, PACKS } from '../config/packs.js';
import { generateRecoveryCode, sha256Hex } from '../utils/userToken.js';

// ================================================================
// ENDPOINT: Credit balance
// ================================================================
export async function handleCreditBalance({ request, DB, corsHeaders, getUserToken }) {
  const userId = getUserToken(request);

  if (!userId || userId === 'anonymous') {
    return new Response(
      JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    let user = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    if (!user) {
      user = { credits: 0, lifetime: 0 };
      await DB.prepare(
        'INSERT OR IGNORE INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)'
      ).bind(userId).run();
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? LIMIT 1000'
    ).bind(userId).all();
    const purchased = purchasedRows.results.map(r => r.photo_id);

    return new Response(
      JSON.stringify({ credits: user.credits, lifetime: !!user.lifetime, purchased }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('/api/credits/balance error:', e.message);
    return new Response(
      JSON.stringify({ credits: 0, lifetime: false, purchased: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ================================================================
// ENDPOINT: Generate / rotate Recovery Code for current token
// ================================================================
export async function handleCreateRecoveryCode({ request, DB, corsHeaders, getUserToken }) {
  const userId = getUserToken(request);
  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    await DB.prepare(
      'INSERT OR IGNORE INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 0)'
    ).bind(userId).run();

    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await sha256Hex(recoveryCode);

    await DB.prepare(
      'UPDATE user_credits SET recovery_hash = ? WHERE user_id = ?'
    ).bind(recoveryHash, userId).run();

    return new Response(JSON.stringify({ success: true, recoveryCode }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('/api/credits/recovery error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Failed to generate recovery code' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Restore account token via Recovery Code
// ================================================================
export async function handleRecoverAccount({ request, DB, corsHeaders, checkRateLimit }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawCode = String(body?.recoveryCode || '').trim().toUpperCase();
  if (!/^ZX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCode)) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid recovery code format' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'recover-client';
  if (!await checkRateLimit('recover', ip, 10, 3600)) {
    return new Response(JSON.stringify({ success: false, error: 'Too many recovery attempts. Try again later.' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const recoveryHash = await sha256Hex(rawCode);
    const user = await DB.prepare(
      'SELECT user_id, credits, lifetime FROM user_credits WHERE recovery_hash = ? LIMIT 1'
    ).bind(recoveryHash).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Recovery code not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const purchasedRows = await DB.prepare(
      'SELECT photo_id FROM purchased_images WHERE user_id = ? LIMIT 1000'
    ).bind(user.user_id).all();

    return new Response(JSON.stringify({
      success:   true,
      userToken: user.user_id,
      credits:   user.credits || 0,
      lifetime:  !!user.lifetime,
      purchased: purchasedRows.results.map(r => r.photo_id),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('/api/credits/recover error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Database error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ================================================================
// ENDPOINT: Purchase credits
// ================================================================
export async function handleCreditPurchase({ request, DB, corsHeaders, getUserToken, getPayPalAccessToken, verifyPayPalOrder }) {
  const userId = getUserToken(request);

  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Invalid user token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { pack, orderId } = body;

  if (!pack || !orderId || typeof orderId !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'Missing pack or orderId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const packData = PACKS[pack];
  if (!packData) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid pack' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const existingPayment = await DB.prepare(
      'SELECT user_id, status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingPayment) {
      if (existingPayment.user_id && existingPayment.user_id !== userId) {
        return new Response(JSON.stringify({
          success: false,
          error:   'Order belongs to a different user',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (existingPayment.status === 'completed') {
        const user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const accessToken  = await getPayPalAccessToken();
    const orderDetails = await verifyPayPalOrder(orderId, accessToken);

    if (!orderDetails) {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status = 'completed' THEN 'completed' ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status = 'completed' THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(`order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack], 'Order not found in PayPal').run();

      return new Response(JSON.stringify({ success: false, error: 'PayPal order not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (orderDetails.status !== 'COMPLETED') {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status = 'completed' THEN 'completed' ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status = 'completed' THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack],
        `Order status is ${orderDetails.status}, not COMPLETED`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const purchaseUnit  = orderDetails.purchase_units?.[0];
    const capture       = purchaseUnit?.payments?.captures?.[0];
    const orderCustomId = purchaseUnit?.custom_id || null;

    if (orderCustomId && orderCustomId !== userId) {
      return new Response(JSON.stringify({
        success: false,
        error:   'Order user mismatch',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const verifiedUserId   = orderCustomId || userId;
    const verifiedAmount   = capture?.amount?.value !== undefined ? parseFloat(capture.amount.value) : null;
    const verifiedCurrency = capture?.amount?.currency_code || null;
    const captureStatus    = capture?.status || null;

    if (
      verifiedAmount === null ||
      !Number.isFinite(verifiedAmount) ||
      verifiedCurrency !== 'USD' ||
      captureStatus !== 'COMPLETED'
    ) {
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status = 'completed' THEN 'completed' ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status = 'completed' THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack],
        `Missing/invalid capture details (currency=${verifiedCurrency}, status=${captureStatus})`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   'PayPal capture details missing or invalid currency.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actualCents   = Math.round(verifiedAmount * 100);
    const expectedCents = Math.round(PACK_PRICES[pack] * 100);
    if (actualCents !== expectedCents) {
      const roundedAmount = actualCents / 100;
      await DB.prepare(`
        INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = CASE WHEN payment_orders.status = 'completed' THEN 'completed' ELSE 'failed' END,
          error_message = CASE WHEN payment_orders.status = 'completed' THEN payment_orders.error_message ELSE excluded.error_message END
      `).bind(
        `order:${orderId}`, verifiedUserId, orderId, pack, roundedAmount,
        `Amount mismatch: expected $${PACK_PRICES[pack]}, got $${roundedAmount}`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   `Amount mismatch. Expected $${PACK_PRICES[pack]}, received $${roundedAmount}.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const claim = await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status)
      VALUES (?, ?, ?, ?, ?, 'processing')
      ON CONFLICT(id) DO NOTHING
    `).bind(`order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack]).run();

    if (!claim.meta || claim.meta.changes === 0) {
      await new Promise(r => setTimeout(r, 1500));

      const settled = await DB.prepare(
        'SELECT user_id, status FROM payment_orders WHERE id = ?'
      ).bind(`order:${orderId}`).first();

      if (settled?.user_id && settled.user_id !== userId) {
        return new Response(JSON.stringify({
          success: false,
          error:   'Order belongs to a different user',
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      if (settled?.status === 'completed') {
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits || 0,
          lifetime:   !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: false,
        error:   'Order is being processed by another request. Please refresh in a few seconds.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      if (packData.lifetime) {
        await DB.prepare(
          'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, 0, 1) ON CONFLICT(user_id) DO UPDATE SET lifetime = 1'
        ).bind(verifiedUserId).run();
      } else {
        const totalCredits = packData.credits + (packData.bonus || 0);
        await DB.prepare(
          'INSERT INTO user_credits (user_id, credits, lifetime) VALUES (?, ?, 0) ON CONFLICT(user_id) DO UPDATE SET credits = credits + ?'
        ).bind(verifiedUserId, totalCredits, totalCredits).run();
      }

      await DB.prepare(
        `UPDATE payment_orders SET status = 'completed', completed_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), `order:${orderId}`).run();

      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      console.log(`Payment success: User ${verifiedUserId}, Order ${orderId}, Pack ${pack}`);

      return new Response(JSON.stringify({
        success:    true,
        newBalance: user?.credits || 0,
        lifetime:   !!user?.lifetime,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (dbError) {
      console.error('Database credit error:', dbError.message);
      await DB.prepare(
        `UPDATE payment_orders SET status = 'failed', error_message = ? WHERE id = ?`
      ).bind(dbError.message, `order:${orderId}`).run();
      throw dbError;
    }

  } catch (e) {
    console.error('Credit purchase error:', e.message, 'OrderID:', orderId);
    return new Response(JSON.stringify({
      success: false,
      error:   'Payment processing error. Please contact support with Order ID: ' + orderId,
      orderId,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ================================================================
// ENDPOINT: Spend credits
// ================================================================
export async function handleCreditSpend({ request, DB, corsHeaders, getUserToken }) {
  const userId = getUserToken(request);

  if (!userId || userId === 'anonymous') {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { photoId } = body;
  if (!photoId || typeof photoId !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'Missing photoId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const alreadyPurchased = await DB.prepare(
      'SELECT 1 FROM purchased_images WHERE user_id = ? AND photo_id = ?'
    ).bind(userId, photoId).first();

    if (alreadyPurchased) {
      const user = await DB.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(userId).first();
      return new Response(JSON.stringify({
        success:      true,
        newBalance:   user?.credits || 0,
        purchased:    true,
        alreadyOwned: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userRecord = await DB.prepare(
      'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    if (!userRecord) {
      return new Response(JSON.stringify({ success: false, error: 'User not found. Please refresh.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userRecord.lifetime) {
      await DB.prepare(
        'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
      ).bind(userId, photoId).run();
      return new Response(JSON.stringify({
        success:    true,
        newBalance: userRecord.credits || 0,
        purchased:  true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (userRecord.credits < 10) {
      return new Response(JSON.stringify({
        success:        false,
        error:          'Insufficient credits',
        currentCredits: userRecord.credits,
        required:       10,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const deductResult = await DB.prepare(
      'UPDATE user_credits SET credits = credits - 10 WHERE user_id = ? AND credits >= 10'
    ).bind(userId).run();

    if (!deductResult.meta || deductResult.meta.changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error:   'Insufficient credits (concurrent request detected)',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await DB.prepare(
      'INSERT OR IGNORE INTO purchased_images (user_id, photo_id) VALUES (?, ?)'
    ).bind(userId, photoId).run();

    const newUser = await DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();

    return new Response(JSON.stringify({
      success:    true,
      newBalance: newUser?.credits || 0,
      purchased:  true,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('Spend credit error:', e.message);
    return new Response(JSON.stringify({ success: false, error: 'Database error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}