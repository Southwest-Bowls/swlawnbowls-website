// Fills the confirmation email template with SAMPLE data (a practice entry) and writes docs/entries/emails/preview.html. Sends nothing.
import { readFileSync, writeFileSync } from 'node:fs';
const t = readFileSync('docs/entries/emails/entry-confirmation.html', 'utf8');
const sample = { paid: { status_label: 'Payment received', status_bg: '#cdeed7', status_fg: '#12361e', intro_line: 'your entry is confirmed and paid.', payment_line: 'Paid by PayPal',
    next_steps_html: '<p style="margin:0;"><b>What happens next:</b> see the event page for the schedule and start time. If you need to withdraw, open your receipt in the app and tap Request withdrawal.</p>' },
  check: { status_label: 'Entry received, payment pending', status_bg: '#ffe3a8', status_fg: '#3a2800', intro_line: 'we have your entry and are holding your place.', payment_line: 'Check, to be mailed',
    next_steps_html: '<p style="margin:0;"><b>To finish:</b> mail your check to Anne Nunes, (address shown on the event page). You will show as paid once it arrives.</p>' } }[process.argv[2] || 'paid'];
const data = { event_title: '2026 SWD Waterbury (PRACTICE)', contact_name: 'Test', event_date: 'Sunday, October 25, 2026', venue: 'Laguna Woods Lawn Bowling Club, Moulton Pkwy, Laguna Woods, CA',
  team_lines: 'Skip: Test One<br>Lead: Test Two', fee: '$60/team', receipt_number: 'SWD-2026-WATERBURY-0042', issued_date: 'October 15, 2026', receipt_url: '#', td_name: 'the tournament organizer', td_email: 'entries@example.com', ...sample };
writeFileSync('docs/entries/emails/preview.html', t.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? ''));
