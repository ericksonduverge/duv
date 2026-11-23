<?php
declare(strict_types=1);

const DATA_DIR = __DIR__ . '/_data';
const COOKIE   = 'cl_session';

function cfg(): array {
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) { json_out(['error' => 'not_configured'], 500); }
        $c = require $file;
        date_default_timezone_set($c['timezone'] ?? 'America/Santo_Domingo');
    }
    return $c;
}

function json_out(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_post(): array {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { json_out(['error' => 'method'], 405); }
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    return is_array($body) ? $body : [];
}

function client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function data_path(string $sub): string {
    $dir = DATA_DIR . '/' . $sub;
    if (!is_dir($dir)) { mkdir($dir, 0700, true); }
    return $dir;
}

function read_json(string $file): ?array {
    if (!is_file($file)) return null;
    $d = json_decode((string) file_get_contents($file), true);
    return is_array($d) ? $d : null;
}

function write_json(string $file, array $data): void {
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
    rename($tmp, $file);
}

function normalize_email(string $e): ?string {
    $e = strtolower(trim($e));
    if (strlen($e) > 190 || !filter_var($e, FILTER_VALIDATE_EMAIL)) return null;
    return $e;
}

/** Sliding-window rate limit. Returns true when the action is allowed (and records it). */
function rate_ok(string $key, int $max, int $window): bool {
    $file = data_path('rate') . '/' . hash('sha256', $key) . '.json';
    $now = time();
    $hits = array_values(array_filter(read_json($file) ?? [], fn($t) => is_int($t) && $t > $now - $window));
    if (count($hits) >= $max) { write_json($file, $hits); return false; }
    $hits[] = $now;
    write_json($file, $hits);
    return true;
}

// ---------- session cookie (stateless, HMAC-signed) ----------
function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }

/** Cookie path = the site folder (e.g. /coleccionarte/), so the session never leaks to sibling sites. */
function cookie_path(): string {
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return $dir . '/';
}

function issue_session(string $email): void {
    $c = cfg();
    $payload = b64u(json_encode(['e' => $email, 'x' => time() + (int) $c['session_ttl_seconds']]));
    $sig = b64u(hash_hmac('sha256', $payload, $c['secret'], true));
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    setcookie(COOKIE, $payload . '.' . $sig, [
        'expires'  => time() + (int) $c['session_ttl_seconds'],
        'path'     => cookie_path(),
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function current_session(): ?string {
    $c = cfg();
    $raw = $_COOKIE[COOKIE] ?? '';
    if (!is_string($raw) || substr_count($raw, '.') !== 1) return null;
    [$payload, $sig] = explode('.', $raw);
    $good = b64u(hash_hmac('sha256', $payload, $c['secret'], true));
    if (!hash_equals($good, $sig)) return null;
    $d = json_decode(b64u_dec($payload), true);
    if (!is_array($d) || ($d['x'] ?? 0) < time() || empty($d['e'])) return null;
    return (string) $d['e'];
}

// ---------- monthly drops ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** The drop that is live now: the one for this calendar month, else the latest earlier one. */
function current_drop(): array {
    cfg();
    $now = new DateTimeImmutable('now');
    $month = $now->format('Y-m');
    $start = $now->modify('first day of this month')->setTime(0, 0);
    $end = $start->modify('+1 month');
    $label = 'Galería ' . ucfirst(MESES[(int) $now->format('n') - 1]) . ' ' . $now->format('Y');

    $data = read_json(DATA_DIR . '/collection.json') ?? [];
    $drops = $data['drops'] ?? [];
    usort($drops, fn($a, $b) => strcmp((string) $b['month'], (string) $a['month']));
    $live = null;
    foreach ($drops as $d) { if (($d['month'] ?? '') <= $month) { $live = $d; break; } }

    return [
        'month'    => $month,
        'label'    => $label,
        'startsAt' => $start->format(DATE_ATOM),
        'endsAt'   => $end->format(DATE_ATOM),
        'now'      => $now->format(DATE_ATOM),
        'gallery'  => $data['gallery'] ?? new stdClass(),
        'artworks' => array_slice($live['artworks'] ?? [], 0, 10),
    ];
}

// ---------- mail ----------
function send_code_mail(string $to, string $code): bool {
    $m = cfg()['mail'];
    $subject = 'Tu código de acceso a Coleccionarte: ' . $code;
    $text = "Hola,\n\nTu código para entrar a la galería Coleccionarte es:\n\n    $code\n\nVence en 10 minutos. Si no lo pediste, ignora este correo.\n\nColeccionarte";
    $html = '<!doctype html><html><body style="margin:0;background:#f4efe8;font-family:Georgia,serif;color:#1d1916">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">'
        . '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e6ddd0">'
        . '<tr><td style="padding:36px 40px 8px;font-size:22px;letter-spacing:.18em;text-align:center">COLECCIONARTE</td></tr>'
        . '<tr><td style="padding:8px 40px 0;font:15px/1.6 Helvetica,Arial,sans-serif;color:#4b423a;text-align:center">Tu código para entrar a la galería:</td></tr>'
        . '<tr><td style="padding:18px 40px;font:600 34px/1 Helvetica,Arial,sans-serif;letter-spacing:.32em;text-align:center">' . htmlspecialchars($code) . '</td></tr>'
        . '<tr><td style="padding:0 40px 36px;font:13px/1.6 Helvetica,Arial,sans-serif;color:#8a7f74;text-align:center">Vence en 10 minutos. Si no lo pediste, ignora este correo.</td></tr>'
        . '</table></td></tr></table></body></html>';

    $boundary = 'b' . bin2hex(random_bytes(8));
    $fromHeader = '=?UTF-8?B?' . base64_encode($m['from_name']) . '?= <' . $m['from_email'] . '>';
    $headers = [
        'From: ' . $fromHeader,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . substr(strrchr($m['from_email'], '@'), 1) . '>',
        'Date: ' . date(DATE_RFC2822),
    ];
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text))
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html))
        . "--$boundary--\r\n";
    $encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    if (!empty($m['smtp_pass'])) {
        return smtp_send($m, $to, $encSubject, $headers, $body);
    }
    return mail($to, $encSubject, $body, implode("\r\n", $headers), '-f' . $m['from_email']);
}

function smtp_send(array $m, string $to, string $subject, array $headers, string $body): bool {
    $fp = @stream_socket_client('ssl://' . $m['smtp_host'] . ':' . (int) $m['smtp_port'], $errno, $err, 15);
    if (!$fp) { error_log("smtp connect: $err"); return false; }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) { $out .= $line; if (isset($line[3]) && $line[3] === ' ') break; }
        return $out;
    };
    $cmd = function (string $c, array $ok) use ($fp, $read): bool {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) { error_log('smtp: ' . trim($r)); return false; }
        return true;
    };
    $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
    $ok = $cmd('', [220])
        && $cmd('EHLO ' . $host, [250])
        && $cmd('AUTH LOGIN', [334])
        && $cmd(base64_encode($m['smtp_user']), [334])
        && $cmd(base64_encode($m['smtp_pass']), [235])
        && $cmd('MAIL FROM:<' . $m['from_email'] . '>', [250])
        && $cmd('RCPT TO:<' . $to . '>', [250, 251])
        && $cmd('DATA', [354]);
    if ($ok) {
        $msg = implode("\r\n", array_merge($headers, ['To: <' . $to . '>', 'Subject: ' . $subject])) . "\r\n\r\n" . $body;
        $msg = preg_replace('/^\./m', '..', $msg);
        $ok = $cmd($msg . "\r\n.", [250]);
    }
    fwrite($fp, "QUIT\r\n");
    fclose($fp);
    return $ok;
}
