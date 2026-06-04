import { createClient } from '@supabase/supabase-js';

const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

function json(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(data);
}

function err(res, msg) {
  return json(res, { error: msg });
}

function nowISO() {
  return new Date().toISOString();
}

function randId() {
  return String(Date.now());
}

function randToken() {
  const a = Math.random().toString(36).slice(2, 6);
  const b = Date.now().toString(36).slice(-4);
  return `${a}${b}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Vercel Environment Variables');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, {}, 204);
  if (req.method !== 'POST') return err(res, 'API chỉ hỗ trợ POST');

  let data;
  try {
    data = await readBody(req);
  } catch (e) {
    return err(res, 'Dữ liệu JSON không hợp lệ');
  }

  if (!data || !data.action) return err(res, 'Thiếu action');

  const action = data.action;

  try {
    const db = getSupabase();

    if (action === 'login') {
      const { data: rows, error } = await db
        .from('config')
        .select('key,value')
        .in('key', ['username', 'password']);

      if (error) throw error;
      const cfg = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
      if (!cfg.username || !cfg.password) return err(res, 'Chưa cấu hình tài khoản trong DB');

      const success = (data.username || '') === cfg.username && (data.passwordHash || '') === cfg.password;
      return json(res, { success });
    }

    if (action === 'getNotes') {
      const { data: notes, error } = await db
        .from('notes')
        .select('id,title,content,created_at,updated_at,share_token,share_perm,sort_order')
        .order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return json(res, (notes || []).map(n => ({ ...n, sort_order: Number(n.sort_order || 0) })));
    }

    if (action === 'createNote') {
      const id = randId();
      const now = nowISO();
      const title = data.title || 'Ghi chú mới';
      const content = data.content || '';

      const { data: first, error: qErr } = await db
        .from('notes')
        .select('sort_order')
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (qErr) throw qErr;

      const sort_order = first ? Number(first.sort_order || 0) - 1 : 0;
      const { error } = await db.from('notes').insert({
        id,
        title,
        content,
        created_at: now,
        updated_at: now,
        share_token: '',
        share_perm: '',
        sort_order
      });
      if (error) throw error;
      return json(res, { id, created_at: now });
    }

    if (action === 'updateNote') {
      const id = data.id || '';
      const title = data.title || '';
      const content = data.content || '';
      const now = nowISO();

      const { data: rows, error } = await db
        .from('notes')
        .update({ title, content, updated_at: now })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      return json(res, { success: (rows || []).length > 0 });
    }

    if (action === 'deleteNote') {
      const id = data.id || '';
      const { data: rows, error } = await db
        .from('notes')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      return json(res, { success: (rows || []).length > 0 });
    }

    if (action === 'createShare') {
      const id = data.id || '';
      const perm = data.perm || 'view';
      let slug = String(data.slug || '').trim();

      if (!slug) {
        const { data: note, error: qErr } = await db
          .from('notes')
          .select('share_token')
          .eq('id', id)
          .maybeSingle();
        if (qErr) throw qErr;
        slug = note && note.share_token ? note.share_token : randToken();
      }

      const { error } = await db
        .from('notes')
        .update({ share_token: slug, share_perm: perm })
        .eq('id', id);
      if (error) throw error;
      return json(res, { token: slug });
    }

    if (action === 'getByToken') {
      const token = data.token || '';
      const { data: note, error } = await db
        .from('notes')
        .select('id,title,content,share_perm')
        .eq('share_token', token)
        .neq('share_token', '')
        .neq('share_perm', 'private')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!note) return err(res, 'Token không hợp lệ');
      return json(res, note);
    }

    if (action === 'uploadImage') {
      const base64 = data.base64 || '';
      const mimeType = data.mimeType || 'image/png';
      const originalName = String(data.filename || `img_${Date.now()}.png`).replace(/[^a-zA-Z0-9_.-]/g, '_');
      let ext = (MIME_TO_EXT[mimeType] || originalName.split('.').pop() || 'png').toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (!ALLOWED_EXT.has(ext)) return err(res, 'Định dạng ảnh không hợp lệ');

      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length) return err(res, 'Dữ liệu ảnh không hợp lệ');
      if (buffer.length > MAX_IMG_SIZE) return err(res, 'Ảnh quá lớn (tối đa 5MB)');

      const newName = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`;
      const { error: uploadError } = await db.storage
        .from('uploads')
        .upload(newName, buffer, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage.from('uploads').getPublicUrl(newName);
      return json(res, { url: publicData.publicUrl });
    }

    if (action === 'reorderNotes') {
      const order = Array.isArray(data.order) ? data.order : [];
      for (const item of order) {
        const { error } = await db
          .from('notes')
          .update({ sort_order: Number(item.sort_order || 0) })
          .eq('id', item.id);
        if (error) throw error;
      }
      return json(res, { success: true });
    }

    if (action === 'changeCredentials') {
      const curUsername = data.curUsername || '';
      const curPassword = data.curPassword || '';
      const newUsername = data.newUsername || null;
      const newPassword = data.newPassword || null;

      const { data: rows, error } = await db
        .from('config')
        .select('key,value')
        .in('key', ['username', 'password']);
      if (error) throw error;

      const cfg = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
      if (!cfg.username || !cfg.password) return err(res, 'Chưa cấu hình tài khoản trong DB');

      if (curUsername !== cfg.username || curPassword !== cfg.password) {
        return json(res, { success: false, error: 'Sai tài khoản hoặc mật khẩu hiện tại.' });
      }

      if (newUsername) {
        const { error: uErr } = await db.from('config').upsert({ key: 'username', value: newUsername });
        if (uErr) throw uErr;
      }
      if (newPassword) {
        const { error: pErr } = await db.from('config').upsert({ key: 'password', value: newPassword });
        if (pErr) throw pErr;
      }

      return json(res, { success: true });
    }

    return err(res, 'Action không hợp lệ');
  } catch (e) {
    return err(res, e.message || 'Server error');
  }
}
