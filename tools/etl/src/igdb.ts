// cliente da IGDB. o token vem do app da twitch, client credentials,
// e vale uns 60 dias, mas como o etl roda de uma vez só nem precisa renovar

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_URL = 'https://api.igdb.com/v4'

// o limite oficial é 4 req/s. 260ms dá folga pra não tomar 429
const THROTTLE_MS = 260
const MAX_RETRIES = 4

export type Credentials = { clientId: string; token: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const authenticate = async (): Promise<Credentials> => {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('faltou TWITCH_CLIENT_ID ou TWITCH_CLIENT_SECRET no .env da raiz')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  })

  const res = await fetch(`${TOKEN_URL}?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`token negado (${res.status}): ${await res.text()}`)

  const json = (await res.json()) as { access_token: string }
  return { clientId, token: json.access_token }
}

export const query = async <T>(
  { clientId, token }: Credentials,
  endpoint: string,
  body: string
): Promise<T> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${API_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      body
    })

    if (res.ok) {
      await sleep(THROTTLE_MS)
      return (await res.json()) as T
    }

    // 429 é fila cheia e 5xx é instabilidade do lado deles, os dois valem retry
    const retriable = res.status === 429 || res.status >= 500
    if (!retriable || attempt === MAX_RETRIES) {
      throw new Error(`${endpoint} falhou (${res.status}): ${await res.text()}`)
    }

    const wait = THROTTLE_MS * 3 ** (attempt + 1)
    console.warn(`  ${res.status} em ${endpoint}, tentando de novo em ${wait}ms`)
    await sleep(wait)
  }

  throw new Error('inalcançável')
}
