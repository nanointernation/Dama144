import { createClient, type Session } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Profile {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  games_played: number;
  avatar_url?: string | null;
}

export interface MatchRecord {
  id: string;
  player_b: string;
  player_n: string;
  winner_color: 'B' | 'N' | null;
  reason: string;
  elo_change_b: number;
  elo_change_n: number;
  time_control_minutes: number;
  played_at: string;
  opponentUsername: string;
  myEloChange: number;
  won: boolean;
}

export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}

export async function updateUsername(userId: string, username: string): Promise<string | null> {
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);
  return error ? error.message : null;
}

/** Sube una foto de perfil y actualiza el avatar_url del perfil. Devuelve la nueva URL o un mensaje de error. */
export async function uploadAvatar(userId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: cacheBustedUrl }).eq('id', userId);
  if (updateError) return { url: null, error: updateError.message };

  return { url: cacheBustedUrl, error: null };
}

export async function getLeaderboard(limit = 20): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, elo, wins, losses, games_played, avatar_url')
    .order('elo', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as Profile[];
}

/** Historial de partidas del usuario, mas recientes primero, con el nombre del rival ya resuelto. */
export async function getMyMatchHistory(userId: string, limit = 30): Promise<MatchRecord[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, player_b, player_n, winner_color, reason, elo_change_b, elo_change_n, time_control_minutes, played_at, host:player_b(username), guest:player_n(username)'
    )
    .or(`player_b.eq.${userId},player_n.eq.${userId}`)
    .order('played_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as any[]).map((row) => {
    const iAmHost = row.player_b === userId;
    const opponentUsername = iAmHost ? row.host?.username ?? row.guest?.username : row.host?.username;
    return {
      id: row.id,
      player_b: row.player_b,
      player_n: row.player_n,
      winner_color: row.winner_color,
      reason: row.reason,
      elo_change_b: row.elo_change_b,
      elo_change_n: row.elo_change_n,
      time_control_minutes: row.time_control_minutes,
      played_at: row.played_at,
      opponentUsername: (iAmHost ? row.guest?.username : row.host?.username) ?? 'Jugador',
      myEloChange: iAmHost ? row.elo_change_b : row.elo_change_n,
      won: row.winner_color === (iAmHost ? 'B' : 'N'),
    } as MatchRecord;
  });
}
