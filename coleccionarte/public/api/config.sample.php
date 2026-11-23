<?php
// Copy this file to config.php on the server and fill in the real values.
// config.php is never committed to git: it holds the SMTP password and the signing secret.
return [
    // Long random string (64+ chars). Signs the visitor session cookie.
    'secret' => 'CHANGE-ME-to-a-long-random-string',

    // Time zone that decides when each monthly drop starts and ends.
    'timezone' => 'America/Santo_Domingo',

    // Outgoing mail (Hostinger SMTP).
    'mail' => [
        'from_email' => 'no-reply@duvagency.com',
        'from_name'  => 'Coleccionarte',
        'smtp_host'  => 'smtp.hostinger.com',
        'smtp_port'  => 465,          // SSL
        'smtp_user'  => 'no-reply@duvagency.com',
        'smtp_pass'  => '',           // mailbox password; leave empty to fall back to PHP mail()
    ],

    // How long a code and a session last.
    'otp_ttl_seconds'     => 600,      // 10 minutes
    'otp_max_attempts'    => 5,
    'session_ttl_seconds' => 60 * 60 * 24 * 30, // 30 days

    // Only for local testing: returns the code in the API response. Never true in production.
    'debug_return_code' => false,
];
