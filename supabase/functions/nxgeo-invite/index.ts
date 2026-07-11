import { createClient } from '@supabase/supabase-js'

type InviteBody = {
  email?: unknown
  full_name?: unknown
}

type InvitedMember = {
  id: string
  user_id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'user'
  active: boolean
}

const DEFAULT_ALLOWED_ORIGIN = 'https://nxprojetos.com'
const MAX_BODY_BYTES = 8_192

function allowedOrigins() {
  return (Deno.env.get('NXGEO_ALLOWED_ORIGINS') ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsHeaders(origin: string | null) {
  const origins = allowedOrigins()
  const responseOrigin = origin && origins.includes(origin)
    ? origin
    : origins[0] ?? DEFAULT_ALLOWED_ORIGIN

  return {
    'Access-Control-Allow-Origin': responseOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
}

function jsonResponse(
  origin: string | null,
  status: number,
  body: Record<string, unknown>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  })
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim()
    if (value) return value
  }
  return null
}

function defaultKeyFromDictionary(name: string) {
  const rawValue = Deno.env.get(name)
  if (!rawValue) return null

  try {
    const keys = JSON.parse(rawValue) as Record<string, unknown>
    return typeof keys.default === 'string' && keys.default.trim()
      ? keys.default.trim()
      : null
  } catch {
    return null
  }
}

function isInvitedMember(value: unknown): value is InvitedMember {
  if (!value || typeof value !== 'object') return false
  const member = value as Record<string, unknown>
  return typeof member.id === 'string'
    && (typeof member.user_id === 'string' || member.user_id === null)
    && typeof member.email === 'string'
    && (typeof member.full_name === 'string' || member.full_name === null)
    && (member.role === 'admin' || member.role === 'user')
    && typeof member.active === 'boolean'
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  const origins = allowedOrigins()

  if (origin && !origins.includes(origin)) {
    return jsonResponse(origin, 403, { error: 'Origem nao autorizada.' })
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return jsonResponse(origin, 405, { error: 'Metodo nao permitido.' })
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse(origin, 413, { error: 'Solicitacao muito grande.' })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(origin, 401, { error: 'Sessao obrigatoria.' })
  }

  const supabaseUrl = envValue('SUPABASE_URL')
  const publicKey = defaultKeyFromDictionary('SUPABASE_PUBLISHABLE_KEYS')
    ?? envValue('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY')

  if (!supabaseUrl || !publicKey) {
    return jsonResponse(origin, 503, { error: 'Servico de convite nao configurado.' })
  }

  let body: InviteBody
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(origin, 413, { error: 'Solicitacao muito grande.' })
    }

    const parsedBody = JSON.parse(rawBody) as unknown
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return jsonResponse(origin, 400, { error: 'Corpo JSON invalido.' })
    }
    body = parsedBody as InviteBody
  } catch {
    return jsonResponse(origin, 400, { error: 'Corpo JSON invalido.' })
  }

  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''
  const fullName = typeof body.full_name === 'string'
    ? body.full_name.trim()
    : ''

  if (
    email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return jsonResponse(origin, 400, { error: 'Informe um e-mail valido.' })
  }

  if (fullName && (fullName.length < 2 || fullName.length > 120)) {
    return jsonResponse(origin, 400, {
      error: 'O nome deve ter entre 2 e 120 caracteres.',
    })
  }

  const callerClient = createClient(supabaseUrl, publicKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: authorization } },
  })

  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) {
    return jsonResponse(origin, 401, { error: 'Sessao invalida ou expirada.' })
  }

  const { data: memberData, error: memberError } = await callerClient.rpc(
    'nxgeo_admin_invite_member',
    {
      p_email: email,
      p_full_name: fullName || null,
    },
  )

  if (memberError) {
    const forbidden = memberError.code === '42501'
    return jsonResponse(origin, forbidden ? 403 : 400, {
      error: forbidden
        ? 'Somente administradores podem convidar pessoas.'
        : 'Nao foi possivel autorizar este e-mail.',
    })
  }

  if (!isInvitedMember(memberData)) {
    return jsonResponse(origin, 500, { error: 'Resposta de autorizacao invalida.' })
  }

  const publicMailClient = createClient(supabaseUrl, publicKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
  // A pessoa já foi incluída na allowlist pela RPC acima. Ao solicitar o
  // código, o Auth Hook protege a criação da primeira conta e o mesmo e-mail
  // serve para membros novos e existentes, sem abrir o navegador padrão.
  const { error: deliveryError } = await publicMailClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (deliveryError) {
    return jsonResponse(origin, 502, {
      error: 'O acesso foi autorizado, mas o código não foi enviado.',
      member: {
        id: memberData.id,
        email: memberData.email,
        full_name: memberData.full_name,
        role: memberData.role,
        active: memberData.active,
      },
      retryable: true,
    })
  }

  return jsonResponse(origin, 200, {
    member: {
      id: memberData.id,
      email: memberData.email,
      full_name: memberData.full_name,
      role: memberData.role,
      active: memberData.active,
    },
    delivery: 'code',
  })
})
