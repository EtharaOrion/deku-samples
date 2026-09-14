Ravel — how to sign in
======================

The console is at `/console` on the app's public URL. Signup is closed: there are
exactly seven seeded accounts and no others. Every account authenticates at
keycloak, and every one signs in with the same password:

    deku-demo-pw-2026

| Email | Role | Sites |
|---|---|---|
| plant@example.com | plant operator | SITE-DEMO, SITE-PILOT |
| analyst@example.com | laboratory analyst | SITE-DEMO, SITE-PILOT |
| quality@example.com | quality manager | SITE-DEMO, SITE-PILOT |
| claims@example.com | claims manager | SITE-DEMO, SITE-PILOT |
| signer@example.com | certificate signer | SITE-DEMO, SITE-PILOT |
| signer2@example.com | certificate signer | SITE-PILOT only |
| auditor@example.com | auditor | SITE-DEMO, SITE-PILOT |

Every grant ends on 2027-06-30 and nothing renews silently. Sessions last twelve
hours. Signing a certificate asks for the password again; a session alone is not
a signing credential.

There are no collector or converter logins in this build; those parties are read
back through their own records by the accounts above.
