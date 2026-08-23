import { createClient } from '@supabase/supabase-js';
import type { Player } from '@dama144/engine';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export interface AuthUser {
  id: string;
  username: string;
  elo: number;
}

/** Verifica un access token de Supabase y devuelve la identidad + perfil del jugador. */
export async function verifyToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || !supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, elo')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) return null;
    return { id: profile.id, username: profile.username, elo: profile.elo };
  } catch {
    return null;
  }
}

const K_FACTOR = 32;

function expectedScore(myElo: number, oppElo: number): number {
  return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
}

export interface MatchResultInput {
  hostUser: AuthUser;
  guestUser: AuthUser;
  winnerColor: Player;
  reason: string;
  timeControlMinutes: number;
}

/** Calcula el nuevo Elo de ambos jugadores, actualiza sus perfiles, y guarda el registro de la partida. */
export async function recordMatchResult(input: MatchResultInput) {
  if (!supabaseAdmin) return;
  const { hostUser, guestUser, winnerColor, reason, timeControlMinutes } = input;

  const hostScore = winnerColor === 'B' ? 1 : 0;
  const guestScore = winnerColor === 'N' ? 1 : 0;

  const hostExpected = expectedScore(hostUser.elo, guestUser.elo);
  const guestExpected = expectedScore(guestUser.elo, hostUser.elo);

  const hostEloChange = Math.round(K_FACTOR * (hostScore - hostExpected));
  const guestEloChange = Math.round(K_FACTOR * (guestScore - guestExpected));

  const newHostElo = hostUser.elo + hostEloChange;
  const newGuestElo = guestUser.elo + guestEloChange;

  try {
    await applyResultToProfile(hostUser.id, newHostElo, hostScore === 1);
    await applyResultToProfile(guestUser.id, newGuestElo, guestScore === 1);

    await supabaseAdmin.from('matches').insert({
      player_b: hostUser.id,
      player_n: guestUser.id,
      winner_color: winnerColor,
      reason,
      elo_change_b: hostEloChange,
      elo_change_n: guestEloChange,
      time_control_minutes: timeControlMinutes,
    });
  } catch (err) {
    console.error('[Dama144] Error guardando resultado de partida en Supabase:', err);
  }
}

async function applyResultToProfile(userId: string, newElo: number, won: boolean) {
  if (!supabaseAdmin) return;
  const { data: current } = await supabaseAdmin
    .from('profiles')
    .select('wins, losses, games_played')
    .eq('id', userId)
    .single();
  const wins = (current?.wins ?? 0) + (won ? 1 : 0);
  const losses = (current?.losses ?? 0) + (won ? 0 : 1);
  const games_played = (current?.games_played ?? 0) + 1;
  await supabaseAdmin.from('profiles').update({ elo: newElo, wins, losses, games_played }).eq('id', userId);
}
