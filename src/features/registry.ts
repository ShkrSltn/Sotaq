import type { Href } from 'expo-router';

import type { IconName } from '@/components/app-icon';

export type FeatureKey = 'home' | 'kanban' | 'todos' | 'notes' | 'language' | 'admin';

export type FeatureStatus = 'active' | 'planned';

export type FeatureDefinition = {
  key: FeatureKey;
  title: string;
  shortTitle: string;
  description: string;
  icon: IconName;
  route: Href | null;
  status: FeatureStatus;
  stageLabel?: string;
  adminOnly?: boolean;
  defaultUserEnabled: boolean;
  showInMobileBar?: boolean;
};

export const FEATURES: readonly FeatureDefinition[] = [
  {
    key: 'home',
    title: 'Главная',
    shortTitle: 'Главная',
    description: 'Обзор всех модулей и быстрый доступ',
    icon: 'home',
    route: '/',
    status: 'active',
    defaultUserEnabled: true,
    showInMobileBar: true,
  },
  {
    key: 'kanban',
    title: 'Доска',
    shortTitle: 'Доска',
    description: 'Канбан для задач и проектов',
    icon: 'kanban',
    route: '/board',
    status: 'active',
    defaultUserEnabled: true,
    showInMobileBar: true,
  },
  {
    key: 'todos',
    title: 'Список задач',
    shortTitle: 'Задачи',
    description: 'Быстрый to-do лист со связью с доской',
    icon: 'todos',
    route: '/todos',
    status: 'active',
    defaultUserEnabled: true,
    showInMobileBar: true,
  },
  {
    key: 'notes',
    title: 'Заметки',
    shortTitle: 'Заметки',
    description: 'Блочный редактор мыслей в стиле Notion',
    icon: 'notes',
    route: '/notes' as Href,
    status: 'active',
    defaultUserEnabled: true,
    showInMobileBar: true,
  },
  {
    key: 'language',
    title: 'Языки',
    shortTitle: 'Языки',
    description: 'Личный словарь и разбор предложений с ИИ',
    icon: 'language',
    route: '/language' as Href,
    status: 'active',
    defaultUserEnabled: true,
    showInMobileBar: true,
  },
  {
    key: 'admin',
    title: 'Админ-панель',
    shortTitle: 'Админ',
    description: 'Пользователи, роли и доступ к фичам',
    icon: 'admin',
    route: '/admin' as Href,
    status: 'active',
    adminOnly: true,
    defaultUserEnabled: false,
    showInMobileBar: true,
  },
] as const;

export function getActiveFeatures(): FeatureDefinition[] {
  return FEATURES.filter((feature) => feature.status === 'active' && feature.route !== null);
}

export function getPlannedFeatures(): FeatureDefinition[] {
  return FEATURES.filter((feature) => feature.status === 'planned');
}

export function findFeatureByPathname(pathname: string): FeatureDefinition | undefined {
  return FEATURES.find((feature) => {
    if (!feature.route || typeof feature.route !== 'string') {
      return false;
    }
    if (feature.route === '/') {
      return pathname === '/';
    }
    return pathname === feature.route || pathname.startsWith(`${feature.route}/`);
  });
}
