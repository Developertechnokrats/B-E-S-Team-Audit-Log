import { createClient } from '@supabase/supabase-js';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing Supabase service role configuration.' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return json(401, { error: 'Missing authorization token.' });
  }

  const payload = JSON.parse(event.body || '{}');
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const fullName = String(payload.fullName || '').trim();
  const role = payload.role === 'subadmin' ? 'subadmin' : 'user';
  const accountIds = Array.isArray(payload.accountIds) ? payload.accountIds : [];

  if (!email || !password || !fullName) {
    return json(400, { error: 'Email, password, and full name are required.' });
  }

  if (password.length < 6) {
    return json(400, { error: 'Password must be at least 6 characters.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: requester },
    error: requesterError,
  } = await adminClient.auth.getUser(token);

  if (requesterError || !requester) {
    return json(401, { error: 'Invalid authorization token.' });
  }

  const { data: requesterProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single();

  if (profileError || requesterProfile?.role !== 'admin') {
    return json(403, { error: 'Only admins can create users.' });
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError && !createError.message.toLowerCase().includes('already registered')) {
    return json(400, { error: createError.message });
  }

  let user = created?.user;

  if (!user) {
    const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();

    if (listError) {
      return json(400, { error: listError.message });
    }

    user = usersData.users.find((item) => item.email?.toLowerCase() === email);
  }

  if (!user) {
    return json(400, { error: 'Could not create or locate user.' });
  }

  const { error: upsertProfileError } = await adminClient.from('profiles').upsert({
    id: user.id,
    full_name: fullName,
    role,
  });

  if (upsertProfileError) {
    return json(400, { error: upsertProfileError.message });
  }

  if (accountIds.length) {
    const memberships = accountIds.map((accountId) => ({
      account_id: accountId,
      user_id: user.id,
    }));
    const { error: membershipError } = await adminClient.from('account_users').upsert(memberships);

    if (membershipError) {
      return json(400, { error: membershipError.message });
    }
  }

  return json(200, { user: { id: user.id, email, full_name: fullName, role } });
}
