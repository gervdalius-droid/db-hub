# Account email templates (Supabase Auth)

Pasted into Supabase → Authentication → Emails → Templates for the db-hub project.
Sent through custom SMTP: worxmax <hello@worxmax.com>, smtp.hostinger.com:465.
Subjects are in subjects.json. Site URL is https://app.worxmax.com/ ; allowed redirects: https://app.worxmax.com/** and https://worxmax.com/**.

confirm.html      → Confirm sign up
invite.html       → Invite user
magic.html        → Magic link or OTP
recovery.html     → Reset password
email_change.html → Change email address
