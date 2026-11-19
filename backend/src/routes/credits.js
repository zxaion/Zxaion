import { PACK_PRICES, PACKS } from '../config/packs.js';

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
      // FIX: INSERT OR IGNORE — idempotent, cegah error UNIQUE constraint
      // kalau ada 2 request bersamaan dari user baru yang sama.
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

  if (!pack || !orderId) {
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
      'SELECT status FROM payment_orders WHERE order_id = ? LIMIT 1'
    ).bind(orderId).first();

    if (existingPayment) {
      if (existingPayment.status === 'completed') {
        const user = await DB.prepare(
          'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
        ).bind(userId).first();
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits  || 0,
          lifetime:   !!user?.lifetime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const accessToken  = await getPayPalAccessToken();
    const orderDetails = await verifyPayPalOrder(orderId, accessToken);

    if (!orderDetails) {
      await DB.prepare(`
        INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
      `).bind(`order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack], 'Order not found in PayPal').run();

      return new Response(JSON.stringify({ success: false, error: 'PayPal order not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (orderDetails.status !== 'COMPLETED') {
      await DB.prepare(`
        INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'failed', ?)
      `).bind(
        `order:${orderId}`, userId, orderId, pack, PACK_PRICES[pack],
        `Order status is ${orderDetails.status}, not COMPLETED`
      ).run();

      return new Response(JSON.stringify({
        success: false,
        error:   `Payment status invalid: ${orderDetails.status}. Please try again or contact support.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let verifiedUserId = userId;
    let verifiedAmount = null;

    if (orderDetails.purchase_units?.length > 0) {
      const purchaseUnit = orderDetails.purchase_units[0];
      if (purchaseUnit.custom_id) verifiedUserId = purchaseUnit.custom_id;
      if (purchaseUnit.payments?.captures?.length > 0) {
        verifiedAmount = parseFloat(purchaseUnit.payments.captures[0].amount?.value || '0');
      }
    }

    if (verifiedAmount !== null) {
      const roundedAmount  = Math.round(verifiedAmount * 100) / 100;
      const expectedAmount = PACK_PRICES[pack];
      if (roundedAmount !== expectedAmount) {
        await DB.prepare(`
          INSERT OR REPLACE INTO payment_orders (id, user_id, order_id, pack_key, amount, status, error_message)
          VALUES (?, ?, ?, ?, ?, 'failed', ?)
        `).bind(
          `order:${orderId}`, verifiedUserId, orderId, pack, roundedAmount,
          `Amount mismatch: expected $${expectedAmount}, got $${roundedAmount}`
        ).run();

        return new Response(JSON.stringify({
          success: false,
          error:   `Amount mismatch. Expected $${expectedAmount}, received $${roundedAmount}.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // FIX: ATOMIC CLAIM — pasangan dari klaim yang sama di webhook handler.
    const claim = await DB.prepare(`
      INSERT INTO payment_orders (id, user_id, order_id, pack_key, amount, status)
      VALUES (?, ?, ?, ?, ?, 'processing')
      ON CONFLICT(id) DO NOTHING
    `).bind(`order:${orderId}`, verifiedUserId, orderId, pack, PACK_PRICES[pack]).run();

    if (!claim.meta || claim.meta.changes === 0) {
      // Sudah diklaim proses lain (kemungkinan besar webhook PayPal datang
      // lebih dulu). Tunggu sebentar lalu laporkan status final — JANGAN
      // credit dua kali untuk orderId yang sama.
      await new Promise(r => setTimeout(r, 1500));

      const settled = await DB.prepare(
        'SELECT status FROM payment_orders WHERE id = ?'
      ).bind(`order:${orderId}`).first();
      const user = await DB.prepare(
        'SELECT credits, lifetime FROM user_credits WHERE user_id = ?'
      ).bind(verifiedUserId).first();

      if (settled?.status === 'completed') {
        return new Response(JSON.stringify({
          success:    true,
          message:    'Order already processed',
          newBalance: user?.credits  || 0,
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
        newBalance: user?.credits  || 0,
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
  if (!photoId) {
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

  // Atomic deduct — race condition safe.
    // FIX: jumlah baris berubah ada di `meta.changes`, bukan `changes`.
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
