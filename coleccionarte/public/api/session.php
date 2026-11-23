<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$email = current_session();
$drop  = current_drop();
unset($drop['artworks'], $drop['gallery']);
json_out(['authenticated' => (bool) $email, 'drop' => $drop]);
