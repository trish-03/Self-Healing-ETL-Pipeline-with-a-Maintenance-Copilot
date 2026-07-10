import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const activeTableAtom = atom<string>('fact_orders');
export const themeAtom = atomWithStorage<'light' | 'dark'>('theme', 'dark');