import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const activeTableAtom = atom<string>('fact_orders');
export const themeAtom = atomWithStorage<'light' | 'dark'>('theme', 'dark');

//for occ opening the ai panel when clicked on error
export const copilotDrawerOpenAtom = atom(false);

export const pendingCopilotPromptAtom = atom<string | null>(null);

export const pendingCopilotTableAtom = atom<string | null>(null);