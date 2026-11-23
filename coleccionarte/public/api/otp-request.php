<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$body  = require_post();
$email = normalize_email((string) ($body['email'] ?? ''));
if (!$email) json_out(['error' => 'email_invalido'], 422);

$ip = client_ip();
if (!rate_ok('req-ip:' . $ip, 12, 3600) || !rate_ok('req-mail:' . $email, 5, 3600)) {
    json_out(['error' => 'demasiados_intentos'], 429);
}
if (!empty(cfg()['demo_otp'])) json_out(['ok' => true, 'demo' => true]);

$file = data_path('otp') . '/' . hash('sha256', $email) . '.json';
$prev = read_json($file);
if ($prev && ($prev['sent'] ?? 0) > time() - 45) json_out(['error' => 'espera', 'retryIn' => 45 - (time() - $prev['sent'])], 429);

$c    = cfg();
$code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
write_json($file, [
    'hash'     => password_hash($code, PASSWORD_DEFAULT),
    'expires'  => time() + (int) $c['otp_ttl_seconds'],
    'attempts' => 0,
    'sent'     => time(),
]);

$sent = !empty($c['debug_return_code']) ? true : send_code_mail($email, $code);
if (!$sent) json_out(['error' => 'no_se_pudo_enviar'], 502);

$out = ['ok' => true];
if (!empty($c['debug_return_code'])) $out['debugCode'] = $code;
json_out($out);
