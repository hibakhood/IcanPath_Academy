<?php
/**
 * ICANPATH Academy — contact / enrolment form handler.
 *
 * Replaces an earlier version that passed an untrusted string as a mail()
 * *header* argument (header injection), posted $_POST['subject'] straight into
 * the subject line, had no CSRF token, no honeypot, no validation, no exit()
 * after header(), and hard-coded an example@gmail.com recipient.
 *
 * Transport is PHP's built-in mail(). For reliable Nigerian delivery, swap the
 * send block for your SMTP provider (e.g. PHPMailer with authenticated SMTP).
 *
 * Configure before going live:
 *   MAIL_TO, MAIL_FROM, MAIL_FROM_NAME
 *
 * Requires PHP 8.1 or newer (uses the `never` and `mixed` types).
 */

declare(strict_types=1);

const MAIL_TO      = 'admissions@icanpath.example'; // CHANGE ME
const MAIL_FROM    = 'no-reply@icanpath.example';   // CHANGE ME — must be a domain you own
const MAIL_FROM_NAME = 'ICANPATH Academy Enrolment Form';
const MAX_LEN      = 5000;

// --------------------------------------------------------------------------
// Request shape
// --------------------------------------------------------------------------

$wantsJson = isset($_SERVER['HTTP_ACCEPT'])
    && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json');

/** Emit a JSON response and stop. */
function respond(bool $ok, string $message, bool $asJson): never
{
    if ($asJson) {
        http_response_code($ok ? 200 : 422);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code($ok ? 200 : 422);
    }
    exit;
}

function fail(string $message, bool $asJson): never
{
    respond(false, $message, $asJson);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    fail('This endpoint only accepts POST requests.', $wantsJson);
}

// --------------------------------------------------------------------------
// CSRF / cross-origin rejection
//
// This form ships as static HTML, so there is no server-rendered token to
// embed. A synchroniser token would therefore always arrive empty. Instead we
// enforce the two headers a browser always sets on a request, which together
// are equivalent for a public enquiry form:
//
//   Sec-Fetch-Site — set by every modern browser; 'cross-site' means the POST
//                    was initiated from another origin. Cannot be forged by a
//                    page (forbidden header).
//   Origin         — belt and braces, and the fallback where the browser does
//                    not send Sec-Fetch-Site.
//
// If you later render this form from PHP, add a real session token here.
// --------------------------------------------------------------------------

$fetchSite = strtolower(trim((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));

if ($fetchSite !== '' && in_array($fetchSite, ['cross-site', 'same-site'], true)) {
    http_response_code(403);
    fail('Cross-origin form submission rejected.', $wantsJson);
}

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
    $originHost = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?? ''));

    /* HTTP_HOST may carry a port ("localhost:8080"); Origin's host never does.
       Compare hosts only, or every local/dev request would be rejected. */
    $selfHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if (($pos = strrpos($selfHost, ':')) !== false && ctype_digit(substr($selfHost, $pos + 1))) {
        $selfHost = substr($selfHost, 0, $pos);
    }

    if ($originHost === '' || ($selfHost !== '' && !hash_equals($selfHost, $originHost))) {
        http_response_code(403);
        fail('Cross-origin form submission rejected.', $wantsJson);
    }
}

// --------------------------------------------------------------------------
// Honeypot
// --------------------------------------------------------------------------

if (trim((string)($_POST['company_website'] ?? '')) !== '') {
    // Bot filled a field no human can see. Pretend it worked; tell no one.
    respond(true, 'Thank you. Your message has been sent.', $wantsJson);
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

/**
 * Collapse whitespace and strip control characters.
 *
 * $singleLine = true removes *every* control character, including CR and LF.
 * That matters for anything reaching a mail header: a bare newline in a value
 * lets an attacker append their own `Bcc:` line. Multi-line fields such as the
 * message body keep their line breaks.
 */
function clean(mixed $value, int $max, bool $singleLine = false): string
{
    $value = (string)$value;
    $value = $singleLine
        ? (preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '')
        : (preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '');
    $value = trim($value);
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max);
    }
    return substr($value, 0, $max);
}

// Every one of these can end up in a mail header (subject, Reply-To, From
// display name), so all are single-line.
$name    = clean($_POST['name']    ?? '', 120, true);
$email   = clean($_POST['email']   ?? '', 200, true);
$phone   = clean($_POST['phone']   ?? '', 40,  true);
$level   = clean($_POST['level']   ?? '', 40,  true);
$plan    = clean($_POST['plan']    ?? '', 40,  true);
$diet    = clean($_POST['diet']    ?? '', 40,  true);
$message = clean($_POST['message'] ?? '', MAX_LEN);

$errors = [];

if ($name === '' || mb_strlen($name) < 2) {
    $errors['name'] = 'Please enter your full name.';
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address.';
}

/* Belt and braces: nothing header-bound may contain CR or LF, whatever the
   sanitiser above believed. */
foreach (['name' => $name, 'email' => $email, 'phone' => $phone,
          'level' => $level, 'plan' => $plan, 'diet' => $diet] as $field => $val) {
    if (preg_match('/[\r\n]/', $val)) {
        $errors[$field] = 'Illegal characters in your details.';
    }
}

if ($message === '' || mb_strlen($message) < 10) {
    $errors['message'] = 'Please tell us a little more about what you need.';
}

if (($_POST['consent'] ?? '') !== 'yes') {
    $errors['consent'] = 'Please confirm you agree to be contacted.';
}

if ($errors !== []) {
    http_response_code(422);
    if ($wantsJson) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'ok' => false,
            'message' => 'Please correct the highlighted fields and try again.',
            'errors' => $errors,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Location: contact.html#enrol');
    exit;
}

// --------------------------------------------------------------------------
// Compose
// --------------------------------------------------------------------------

$labels = [
    'level' => 'Level',
    'plan'  => 'Plan',
    'diet'  => 'Diet',
    'phone' => 'Phone / WhatsApp',
];

$rows = [
    'Name'       => $name,
    'Email'      => $email,
    'Phone'      => $phone !== '' ? $phone : '—',
    'Level'      => $level !== '' ? $level : 'Not sure',
    'Plan'       => $plan !== '' ? $plan : 'Not sure',
    'Diet'       => $diet !== '' ? $diet : 'Next available',
];

$bodyLines = ['New enquiry from the website', str_repeat('-', 32)];
foreach ($rows as $k => $v) {
    $bodyLines[] = sprintf('%-6s : %s', $k, $v);
}
$bodyLines[] = '';
$bodyLines[] = 'Message:';
$bodyLines[] = str_repeat('-', 32);
$bodyLines[] = $message;
$bodyLines[] = '';
$bodyLines[] = 'Sent: ' . gmdate('Y-m-d H:i:s') . ' UTC';

$body = implode("\n", $bodyLines);

$subject = sprintf('[ICANPATH Academy] %s - %s', $name, $level !== '' ? $level : 'General enquiry');

// Reply-To carries the candidate's address; MAIL_FROM must stay ours.
$headers = [
    'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . '>',
    'Reply-To: ' . $email,
    'X-Mailer: PHP/' . PHP_VERSION,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
];

// --------------------------------------------------------------------------
// Send
// --------------------------------------------------------------------------

$sent = @mail(MAIL_TO, $subject, $body, implode("\r\n", $headers));

if (!$sent) {
    error_log('[ICANPATH Academy] contact form mail() failed. Subject: ' . $subject);
    http_response_code(500);
    fail('We could not send your message. Please email ' . MAIL_TO . ' directly.', $wantsJson);
}

if ($wantsJson) {
    respond(true, 'Thank you. An admissions tutor will reply within one business day.', true);
}

header('Location: thank-you.html');
exit;
