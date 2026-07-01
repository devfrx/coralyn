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
import IconChevronDown from '~icons/lucide/chevron-down';
import IconBell from '~icons/lucide/bell';
import IconSettings from '~icons/lucide/settings';
import IconEuro from '~icons/lucide/euro';
import IconClock from '~icons/lucide/clock';
import IconPhone from '~icons/lucide/phone';
import IconMail from '~icons/lucide/mail';
import IconRenew from '~icons/lucide/refresh-cw';
import IconEdit from '~icons/lucide/pencil';
import IconLogout from '~icons/lucide/log-out';
import IconBuilding from '~icons/lucide/building-2';
import IconLayers from '~icons/lucide/layers';
import IconFilter from '~icons/lucide/filter';
import IconArrowUp from '~icons/lucide/arrow-up';
import IconArrowDown from '~icons/lucide/arrow-down';
import IconWaves from '~icons/lucide/waves';
import IconTrash from '~icons/lucide/trash-2';

/** Nomi consentiti (chrome + Tipologia.icona). Confine offline + fallback. */
export const icons: Record<string, Component> = {
  map: IconMap, calendar: IconCalendar, users: IconUsers, tag: IconTag, chart: IconChart,
  shield: IconShield, search: IconSearch, umbrella: IconUmbrella, palmtree: IconPalm,
  leaf: IconLeaf, plus: IconPlus, star: IconStar, check: IconCheck, x: IconX,
  'chevron-left': IconChevronLeft, 'chevron-right': IconChevronRight, 'chevron-down': IconChevronDown,
  bell: IconBell, settings: IconSettings, euro: IconEuro, clock: IconClock, phone: IconPhone,
  mail: IconMail, renew: IconRenew, edit: IconEdit, logout: IconLogout, building: IconBuilding,
  layers: IconLayers, filter: IconFilter, 'arrow-up': IconArrowUp, 'arrow-down': IconArrowDown,
  waves: IconWaves, 'trash-2': IconTrash,
};

export const FALLBACK_ICON = 'umbrella';
