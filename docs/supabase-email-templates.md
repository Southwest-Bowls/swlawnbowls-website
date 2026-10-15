# Sign-in email: what to paste into Supabase

Where: Supabase dashboard, project azbluidsfrjtoeeesqwa, Authentication, **Emails** (Templates).
Do this for **Magic Link** and for **Confirm signup** (same text for both). Nothing here is applied until you paste it.

**Subject:** `Your Southwest Bowls sign-in code`

**Why the link went to the wrong site.** The app asks for the sign-in link to return to the page it was opened from. Supabase only honours that address if it is in the allowed list. Otherwise it uses the project's **Site URL**. A test address (a laptop or an IP on your Wi-Fi) is not on the list, so the link fell back to the old Site URL. Fix both:
1. Authentication, **URL Configuration**, **Site URL**: `https://swd-google-calendar.vercel.app/app`
2. **Redirect URLs** must contain: `https://swlawnbowls-website.vercel.app/app/**`, `https://swd-google-calendar.vercel.app/app/**`, and (testing only) `http://192.168.0.151:8765/app/**`.

The 6-digit code in the email is what the new sign-in screen asks for, and it works even if the link goes somewhere unexpected.

## HTML (paste as the message body)

```html
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#231120;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid #e4dfe3;">
        <tr><td align="center" style="padding:28px 24px 8px;">
          <img src="https://swd-google-calendar.vercel.app/assets/app/swd-logo.png" width="72" alt="Southwest Bowls" style="display:block;border:0;">
        </td></tr>
        <tr><td style="padding:8px 28px 0;text-align:center;">
          <h1 style="margin:12px 0 8px;font-size:24px;line-height:1.25;">Your sign-in code</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#635861;">Type this code into the Southwest Bowls app to sign in. It works for 10 minutes.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 20px;">
          <div style="display:inline-block;background:#f6f5f7;border:1px solid #e4dfe3;border-radius:14px;padding:14px 22px;font-size:34px;font-weight:800;letter-spacing:10px;">{{ .Token }}</div>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 8px;">
          <p style="margin:0 0 12px;font-size:15px;color:#635861;">Or open the app directly:</p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#c8102e;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px;">Open Southwest Bowls</a>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:14px;line-height:1.5;color:#635861;">Southwest Bowls is the app of the Southwest Bowls Division of lawn bowls: tournaments, results, clubs and Southwest TV.</p>
        </td></tr>
        <tr><td style="padding:12px 28px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:#8a7f88;">Didn't ask for this? Ignore this email and nothing will happen. Nobody can sign in without the code. Questions: apps@giuliagallo.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

Notes
- `{{ .Token }}` is the 6-digit code and `{{ .ConfirmationURL }}` is the link. Both are Supabase placeholders, so leave them exactly as written.
- The logo loads from the live site, so it shows once the app is published.
- Check it by sending yourself a code and opening the email on your phone and on a computer. Some mail apps hide images until you allow them; the code and button still work.
- Sender name and address come from Supabase's email settings. The built-in sender is limited in volume and looks generic. For real use, set up your own sender (SMTP, for example Resend or Zoho) under Authentication, SMTP settings, with a "from" name of "Southwest Bowls".

## Dashboard links (project `azbluidsfrjtoeeesqwa`, account webmaster@swlawnbowls.org)

- Templates (paste the HTML above into **Magic Link** and **Confirm signup**): https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/auth/templates
- Users (look up a person who got no code): https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/auth/users
- URL Configuration (Site URL and redirect URLs): https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/auth/url-configuration
- SMTP settings (custom sender, needed before launch): https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/auth/smtp
- Rate limits: https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/auth/rate-limits
- Table Editor (roster): https://supabase.com/dashboard/project/azbluidsfrjtoeeesqwa/editor

## Why someone may get no code

1. The template was never pasted, so the email has a link but no 6-digit code.
2. Sign-ups are closed (`SIGNUP_OPEN = false` in `assets/app/app.js`): an email that is not already a user gets nothing, by design (the app never reveals who is a member).
3. Custom SMTP is off, so Supabase's built-in sender is used. It is heavily rate-limited and often lands in spam. Set up a transactional sender on swlawnbowls.org (SPF and DKIM records) before launch.
4. Check spam, and look the address up under Authentication, Users.
