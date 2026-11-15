import { api } from './api';
/** Open the moodboard of a place of work (created on first use). */
export async function openBoard(navigate: (to: string) => void, type: string, id?: number) {
  const d = await api.get<{ board: { id: number } }>(`/moodboards/for?type=${type}${id ? `&id=${id}` : ''}`);
  navigate(`/moodboard/${d.board.id}`);
}
