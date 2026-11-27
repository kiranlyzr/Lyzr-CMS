<?php
/**
 * Lyzr CMS bridge: lets the Product Pages CMS edit ONE fixed list of pages without a WordPress login.
 *
 * Install: WPCode > Add Snippet > PHP Snippet > Run Everywhere > Active. (Or save as a file in wp-content/mu-plugins/.)
 *
 * Why: the normal REST login (application passwords) is being ignored on this site, so the CMS uses its own route
 * with its own secret key instead. The key is sent in the "X-CMS-Key" header; this file stores only its SHA-256 hash,
 * so reading this snippet does not reveal the key.
 *
 * What it can do (and nothing else):
 *   - read / replace the CONTENT of the pages listed in LYZR_CMS_PAGES
 *   - set those pages to draft or publish
 *   - keep its own backups of each page before every change, and list / read them (for restore): this site keeps no WordPress revisions
 *   - upload an image to the media library
 * It cannot touch any other page or post, users, settings, plugins, titles, slugs, templates, or delete anything.
 *
 * Routes: /wp-json/lyzr-cms/v1/  ping | pages | pages/<id> | pages/<id>/content | pages/<id>/status | pages/<id>/revisions | pages/<id>/revisions/<rev> | media
 */
if (!defined('ABSPATH')) { exit; }

/* the only pages the CMS may touch (Open Finetuner, Sovereign AI, Open Cowork) */
if (!defined('LYZR_CMS_PAGES')) { define('LYZR_CMS_PAGES', '153241,130050,154655'); }
/* SHA-256 of the CMS key (the key itself lives only in the CMS server's secrets) */
if (!defined('LYZR_CMS_KEY_SHA256')) { define('LYZR_CMS_KEY_SHA256', '__KEY_SHA256__'); }

function lyzr_cms_ids() { return array_map('intval', array_filter(explode(',', LYZR_CMS_PAGES))); }

function lyzr_cms_client_ip() {
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'x';
}

/** permission check for every route: the secret key, with a lockout after repeated wrong keys */
function lyzr_cms_auth(WP_REST_Request $req) {
    $bucket = 'lyzr_cms_f_' . md5(lyzr_cms_client_ip());
    $fails = (int) get_transient($bucket);
    if ($fails >= 10) { return new WP_Error('lyzr_cms_locked', 'Too many wrong keys. Try again later.', array('status' => 429)); }
    $key = (string) $req->get_header('x-cms-key');
    $ok = $key !== '' && strlen(LYZR_CMS_KEY_SHA256) === 64 && hash_equals(LYZR_CMS_KEY_SHA256, hash('sha256', $key));
    if (!$ok) {
        set_transient($bucket, $fails + 1, 15 * MINUTE_IN_SECONDS);
        return new WP_Error('lyzr_cms_forbidden', 'Forbidden', array('status' => 403));
    }
    if ($fails) { delete_transient($bucket); }
    return true;
}

/** the page id from the URL, only if it is on the allow-list and really is a page */
function lyzr_cms_page(WP_REST_Request $req) {
    $id = (int) $req['id'];
    if (!in_array($id, lyzr_cms_ids(), true)) { return new WP_Error('lyzr_cms_page', 'Page not allowed', array('status' => 403)); }
    $p = get_post($id);
    if (!$p || $p->post_type !== 'page' || $p->post_status === 'trash') { return new WP_Error('lyzr_cms_page', 'Page not found', array('status' => 404)); }
    return $p;
}

function lyzr_cms_summary($p) {
    return array(
        'id' => (int) $p->ID,
        'slug' => $p->post_name,
        'status' => $p->post_status,
        'link' => get_permalink($p->ID),
        'modified' => mysql2date('Y-m-d\TH:i:s', $p->post_modified, false),
        'title' => $p->post_title,
    );
}

/** save content / status without WordPress's HTML filter (it would strip <script> and <style>, because no user is logged in) */
function lyzr_cms_update($args) {
    kses_remove_filters();
    $res = wp_update_post(wp_slash($args), true);
    kses_init_filters();
    return $res;
}

/* ---- own backups: this site keeps no WordPress page revisions, so the bridge saves the previous content before every change ---- */
if (!defined('LYZR_CMS_KEEP')) { define('LYZR_CMS_KEEP', 20); }   /* backups kept per page */

function lyzr_cms_backup_dir() {
    $u = wp_upload_dir();
    if (!empty($u['error'])) { return false; }
    $dir = trailingslashit($u['basedir']) . 'lyzr-cms-backups-' . substr(hash('sha256', 'dir' . LYZR_CMS_KEY_SHA256), 0, 12);   /* unguessable folder name */
    if (!is_dir($dir)) {
        if (!wp_mkdir_p($dir)) { return false; }
        @file_put_contents($dir . '/index.php', "<?php // Silence is golden.\n");
        @file_put_contents($dir . '/.htaccess', "Deny from all\n");
    }
    return $dir;
}

/** saves $p->post_content as a compressed file; returns the backup id (a UTC timestamp) or false. A failed backup stops the save. */
function lyzr_cms_backup($p) {
    $dir = lyzr_cms_backup_dir(); if (!$dir) { return false; }
    $ts = time();
    while (file_exists($dir . '/' . (int) $p->ID . '-' . gmdate('YmdHis', $ts) . '.html.gz')) { $ts++; }
    $id = gmdate('YmdHis', $ts);
    $file = $dir . '/' . (int) $p->ID . '-' . $id . '.html.gz';
    $gz = gzencode((string) $p->post_content, 6);
    if ($gz === false || file_put_contents($file, $gz) === false || !is_file($file) || filesize($file) < 10) { return false; }
    $all = glob($dir . '/' . (int) $p->ID . '-*.html.gz');
    if ($all && count($all) > LYZR_CMS_KEEP) { rsort($all); foreach (array_slice($all, LYZR_CMS_KEEP) as $old) { @unlink($old); } }
    return $id;
}

function lyzr_cms_backup_list($page_id) {
    $dir = lyzr_cms_backup_dir(); if (!$dir) { return array(); }
    $all = glob($dir . '/' . (int) $page_id . '-*.html.gz'); if (!$all) { return array(); }
    rsort($all);
    $out = array();
    foreach (array_slice($all, 0, 15) as $f) {
        if (!preg_match('/-(\d{14})\.html\.gz$/', $f, $m)) { continue; }
        $d = DateTime::createFromFormat('YmdHis', $m[1], new DateTimeZone('UTC'));
        $out[] = array('id' => (int) $m[1], 'date' => $d ? $d->format('Y-m-d\TH:i:s') : '');
    }
    return $out;
}

function lyzr_cms_backup_read($page_id, $rev) {
    $dir = lyzr_cms_backup_dir();
    if (!$dir || !preg_match('/^\d{14}$/', (string) $rev)) { return false; }
    $file = $dir . '/' . (int) $page_id . '-' . $rev . '.html.gz';
    if (!is_file($file)) { return false; }
    $raw = file_get_contents($file);
    return $raw === false ? false : gzdecode($raw);
}

function lyzr_cms_nocache() {
    if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
    nocache_headers();
}

add_action('rest_api_init', function () {
    $ns = 'lyzr-cms/v1';
    $auth = 'lyzr_cms_auth';

    /* diagnostic: says whether the key header arrives and is right. Works for anyone, reveals nothing else. */
    register_rest_route($ns, '/ping', array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $key = (string) $req->get_header('x-cms-key');
        return array(
            'ok' => true,
            'bridge' => 'lyzr-cms',
            'key_header_received' => $key !== '',
            'key_valid' => $key !== '' && strlen(LYZR_CMS_KEY_SHA256) === 64 && hash_equals(LYZR_CMS_KEY_SHA256, hash('sha256', $key)),
            'authorization_header_received' => (string) $req->get_header('authorization') !== '',
            'pages' => count(lyzr_cms_ids()),
        );
    }));

    register_rest_route($ns, '/pages', array('methods' => 'GET', 'permission_callback' => $auth, 'callback' => function () {
        lyzr_cms_nocache();
        $out = array();
        foreach (lyzr_cms_ids() as $id) { $p = get_post($id); if ($p && $p->post_type === 'page') { $out[] = lyzr_cms_summary($p); } }
        return array('pages' => $out);
    }));

    register_rest_route($ns, '/pages/(?P<id>\d+)', array('methods' => 'GET', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $p = lyzr_cms_page($req); if (is_wp_error($p)) { return $p; }
        return array_merge(lyzr_cms_summary($p), array('content' => $p->post_content));
    }));

    register_rest_route($ns, '/pages/(?P<id>\d+)/content', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $p = lyzr_cms_page($req); if (is_wp_error($p)) { return $p; }
        $params = $req->get_json_params();
        $content = is_array($params) && isset($params['content']) && is_string($params['content']) ? $params['content'] : null;
        if ($content === null || strlen($content) < 50) { return new WP_Error('lyzr_cms_content', 'Content missing or too short', array('status' => 400)); }
        if ($content !== $p->post_content && lyzr_cms_backup($p) === false) { return new WP_Error('lyzr_cms_backup', 'Could not save a backup of the current page, so nothing was changed.', array('status' => 500)); }
        $r = lyzr_cms_update(array('ID' => $p->ID, 'post_content' => $content));   /* only the content: title, slug, status, template stay as they are */
        if (is_wp_error($r)) { return new WP_Error('lyzr_cms_save', $r->get_error_message(), array('status' => 500)); }
        clean_post_cache($p->ID);
        return lyzr_cms_summary(get_post($p->ID));
    }));

    register_rest_route($ns, '/pages/(?P<id>\d+)/status', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $p = lyzr_cms_page($req); if (is_wp_error($p)) { return $p; }
        $params = $req->get_json_params();
        $status = is_array($params) && isset($params['status']) ? $params['status'] : '';
        if ($status !== 'draft' && $status !== 'publish') { return new WP_Error('lyzr_cms_status', 'Status must be draft or publish', array('status' => 400)); }
        $r = lyzr_cms_update(array('ID' => $p->ID, 'post_status' => $status));
        if (is_wp_error($r)) { return new WP_Error('lyzr_cms_save', $r->get_error_message(), array('status' => 500)); }
        clean_post_cache($p->ID);
        return lyzr_cms_summary(get_post($p->ID));
    }));

    register_rest_route($ns, '/pages/(?P<id>\d+)/revisions', array('methods' => 'GET', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $p = lyzr_cms_page($req); if (is_wp_error($p)) { return $p; }
        return array('revisions' => lyzr_cms_backup_list($p->ID));
    }));

    register_rest_route($ns, '/pages/(?P<id>\d+)/revisions/(?P<rev>\d+)', array('methods' => 'GET', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $p = lyzr_cms_page($req); if (is_wp_error($p)) { return $p; }
        $c = lyzr_cms_backup_read($p->ID, (string) $req['rev']);
        if ($c === false) { return new WP_Error('lyzr_cms_rev', 'Backup not found', array('status' => 404)); }
        $d = DateTime::createFromFormat('YmdHis', (string) $req['rev'], new DateTimeZone('UTC'));
        return array('id' => (int) $req['rev'], 'date' => $d ? $d->format('Y-m-d\TH:i:s') : '', 'content' => $c);
    }));

    /* image upload: the raw file is the request body; Content-Type = image type, X-Filename = file name */
    register_rest_route($ns, '/media', array('methods' => 'POST', 'permission_callback' => $auth, 'callback' => function (WP_REST_Request $req) {
        lyzr_cms_nocache();
        $body = $req->get_body();
        if ($body === '' || strlen($body) > 12 * 1024 * 1024) { return new WP_Error('lyzr_cms_media', 'Empty or too large (12 MB max)', array('status' => 400)); }
        $name = sanitize_file_name((string) $req->get_header('x-filename'));
        if ($name === '') { $name = 'cms-' . time() . '.png'; }
        $allowed = array('jpg|jpeg|jpe' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'avif' => 'image/avif');   /* no SVG: it can carry scripts */
        $ft = wp_check_filetype($name, $allowed);
        if (empty($ft['type'])) { return new WP_Error('lyzr_cms_media', 'Only jpg, png, gif, webp and avif images are accepted', array('status' => 415)); }
        $up = wp_upload_bits($name, null, $body);
        if (!empty($up['error'])) { return new WP_Error('lyzr_cms_media', $up['error'], array('status' => 500)); }
        $att = wp_insert_attachment(array('post_mime_type' => $ft['type'], 'post_title' => preg_replace('/\.[^.]+$/', '', $name), 'post_status' => 'inherit'), $up['file'], 0, true);
        if (is_wp_error($att)) { return new WP_Error('lyzr_cms_media', $att->get_error_message(), array('status' => 500)); }
        require_once ABSPATH . 'wp-admin/includes/image.php';
        wp_update_attachment_metadata($att, wp_generate_attachment_metadata($att, $up['file']));
        return array('id' => (int) $att, 'source_url' => wp_get_attachment_url($att));
    }));
});
