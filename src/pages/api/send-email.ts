import type { APIRoute } from 'astro';
import { sendOrderNotification, type EmailActionType } from '../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    
    // Validate request
    if (!body.orderData || !body.actionType) {
      return new Response(JSON.stringify({ error: 'Missing orderData or actionType' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { orderData, actionType } = body;

    // Send the email
    const result = await sendOrderNotification(orderData, actionType as EmailActionType);

    if (result.success) {
      return new Response(JSON.stringify({ success: true }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to send email', details: result.error }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (err: any) {
    console.error('Email API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
