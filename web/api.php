<?php
/**
 * API PROXY — Chuyển tiếp request từ Web (hosting) → admin_app.py (VPS)
 * Web gọi api.php → api.php forward tới VPS Flask API → trả JSON về web
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') { http_response_code(200); exit; }

// ── ĐỌC CẤU HÌNH ────────────────────────────────
$env_file = __DIR__ . '/.env';
$VPS_API_URL = '';
if (file_exists($env_file)) {
    foreach (file($env_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) == 2) {
            $k = trim($parts[0]); $v = trim($parts[1]);
            if ($k === 'VPS_API_URL') $VPS_API_URL = $v;
        }
    }
}

if (empty($VPS_API_URL)) {
    echo json_encode(['error' => 'VPS_API_URL chưa cấu hình trong .env']);
    exit;
}

// ── HÀM PROXY ────────────────────────────────────
function proxyRequest($vpsUrl, $path, $method, $body = null) {
    $url = rtrim($vpsUrl, '/') . '/api' . $path;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } elseif ($method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } elseif ($method === 'DELETE') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    
    // Forward cookies (session)
    if (isset($_COOKIE['session'])) {
        curl_setopt($ch, CURLOPT_COOKIE, 'session=' . $_COOKIE['session']);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    // Lấy cookie từ VPS để set lại cho browser
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    
    if ($error) {
        http_response_code(503);
        return json_encode(['error' => 'VPS_OFFLINE', 'msg' => 'Không kết nối được VPS. Hãy kiểm tra lại.']);
    }
    
    http_response_code($httpCode);
    return $response;
}

// ── COOKIE PROXY (để session hoạt động) ──────────
function proxyWithSession($vpsUrl, $path, $method, $body = null) {
    $url = rtrim($vpsUrl, '/') . '/api' . $path;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } elseif ($method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } elseif ($method === 'DELETE') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
    }
    
    // Forward session cookie
    $cookieStr = '';
    foreach ($_COOKIE as $k => $v) { $cookieStr .= "$k=$v; "; }
    if ($cookieStr) curl_setopt($ch, CURLOPT_COOKIE, $cookieStr);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    
    if ($error) {
        http_response_code(503);
        return json_encode(['error' => 'VPS_OFFLINE', 'msg' => 'Không kết nối được VPS.']);
    }
    
    // Parse headers để forward Set-Cookie
    $headerStr = substr($response, 0, $headerSize);
    $bodyStr = substr($response, $headerSize);
    
    foreach (explode("\r\n", $headerStr) as $hdr) {
        if (stripos($hdr, 'Set-Cookie:') === 0) {
            header($hdr, false);
        }
    }
    
    http_response_code($httpCode);
    return $bodyStr;
}

// ── CHECK VPS STATUS ─────────────────────────────
if (isset($_GET['action']) && $_GET['action'] === 'check_status') {
    $ch = curl_init(rtrim($VPS_API_URL, '/') . '/api/check_auth');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    $r = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    echo json_encode(['status' => $err ? 'offline' : 'online']);
    exit;
}

// ── ROUTE: lấy path từ query string ──────────────
$path = $_GET['path'] ?? '';
if (empty($path)) {
    echo json_encode(['error' => 'Thiếu path. VD: api.php?path=/stats']);
    exit;
}

// Đảm bảo path bắt đầu bằng /
if ($path[0] !== '/') $path = '/' . $path;

// Query string (bỏ path và action ra)
$queryParams = $_GET;
unset($queryParams['path']);
unset($queryParams['action']);
$queryString = http_build_query($queryParams);
if ($queryString) $path .= '?' . $queryString;

$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');

echo proxyWithSession($VPS_API_URL, $path, $method, $body ?: null);
