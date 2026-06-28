import type { Component } from 'vue';
import IconMap from '~icons/lucide/map';
import IconCalendar from '~icons/lucide/calendar';
import IconUsers from '~icons/lucide/users';
import IconTag from '~icons/lucide/tag';
import IconChart from '~icons/lucide/bar-chart-3';
import IconShield from '~icons/lucide/shield';
import IconSearch from '~icons/lucide/search';
import IconUmbrella from '~icons/lucide/umbrella';
import IconPalm from '~icons/lucide/tree-palm';
import IconLeaf from '~icons/lucide/leaf';
import IconPlus from '~icons/lucide/plus';
import IconStar from '~icons/lucide/star';
import IconCheck from '~icons/lucide/check';
import IconX from '~icons/lucide/x';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';

/** Nomi consentiti (chrome + Tipologia.icona). Confine offline + fallback. */
export const icons: Record<string, Component> = {
  map: IconMap, calendar: IconCalendar, users: IconUsers, tag: IconTag, chart: IconChart,
  shield: IconShield, search: IconSearch, umbrella: IconUmbrella, palmtree: IconPalm,
  leaf: IconLeaf, plus: IconPlus, star: IconStar, check: IconCheck, x: IconX,
  'chevron-left': IconChevronLeft, 'chevron-right': IconChevronRight,
};

export const FALLBACK_ICON = 'umbrella';
