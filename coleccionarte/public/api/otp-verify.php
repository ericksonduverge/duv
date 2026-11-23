<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$body  = require_post();
$email = normalize_email((string) ($body['email'] ?? ''));
$code  = preg_replace('/\D/', '', (string) ($body['code'] ?? ''));
if (!$email || strlen($code) !== 6) json_out(['error' => 'codigo_invalido'], 422);
if (!rate_ok('ver-ip:' . client_ip(), 30, 3600)) json_out(['error' => 'demasiados_intentos'], 429);

$c    = cfg();
$file = data_path('otp') . '/' . hash('sha256', $email) . '.json';
$otp  = read_json($file);
if (!$otp || ($otp['expires'] ?? 0) < time()) { @unlink($file); json_out(['error' => 'codigo_vencido'], 410); }
if (($otp['attempts'] ?? 0) >= (int) $c['otp_max_attempts']) { @unlink($file); json_out(['error' => 'demasiados_intentos'], 429); }

if (!password_verify($code, (string) $otp['hash'])) {
    $otp['attempts'] = ($otp['attempts'] ?? 0) + 1;
    write_json($file, $otp);
    json_out(['error' => 'codigo_incorrecto', 'left' => max(0, (int) $c['otp_max_attempts'] - $otp['attempts'])], 401);
}
@unlink($file);
issue_session($email);

// Keep a list of verified visitors for the gallery (leads).
$log = data_path('visitors') . '/visitors.csv';
$fh = fopen($log, 'a');
if ($fh) { fputcsv($fh, [date(DATE_ATOM), $email, client_ip()]); fclose($fh); }

json_out(['ok' => true]);
