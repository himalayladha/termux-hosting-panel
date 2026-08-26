<?php
header('Content-Type: application/json');

$response = [
    'status' => 'online',
    'message' => 'Hello from PHP on TermuxPanel!',
    'runtime' => 'PHP ' . phpversion(),
    'timestamp' => date('c'),
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP CLI Server',
    'uri' => $_SERVER['REQUEST_URI'] ?? '/'
];

echo json_encode($response, JSON_PRETTY_PRINT);
