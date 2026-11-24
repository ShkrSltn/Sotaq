import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

type Task = {
  id: string;
  title: string;
  done: boolean;
};

const INITIAL_TASKS: Task[] = [
  { id: '1', title: 'Купить продукты', done: false },
  { id: '2', title: 'Позвонить', done: false },
  { id: '3', title: 'Разобрать почту', done: true },
];

const palette = {
  light: {
    column: '#FFFFFF',
    card: '#F6F7F8',
    text: '#16181D',
    muted: '#8B909A',
    line: '#E6E8EC',
    mark: '#16181D',
  },
  dark: {
    column: '#1C1D21',
    card: '#26272C',
    text: '#F3F4F6',
    muted: '#9AA0A8',
    line: '#2C2E33',
    mark: '#F3F4F6',
  },
} as const;

export function TodoList() {
  const colors = palette[useResolvedColorScheme()];
  const nextId = useRef(INITIAL_TASKS.length + 1);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [draft, setDraft] = useState('');
  const openCount = tasks.filter((task) => !task.done).length;

  function addTask() {
    const title = draft.trim();
    if (!title) {
      return;
    }

    const id = String(nextId.current);
    nextId.current += 1;
    setTasks((current) => [{ id, title, done: false }, ...current]);
    setDraft('');
  }

  function toggleTask(id: string) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    );
  }

  function removeTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.panel, { backgroundColor: colors.column }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Список</Text>
          <Text style={[styles.count, { color: colors.muted }]}>{openCount}</Text>
        </View>

        <View style={[styles.composer, { borderBottomColor: colors.line }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addTask}
            placeholder="Новая задача"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={[styles.input, { color: colors.text }]}
          />
          <RipplePressable
            accessibilityLabel="Добавить задачу"
            disabled={draft.trim().length === 0}
            onPress={addTask}
            style={StyleSheet.flatten([
              styles.addButton,
              { backgroundColor: colors.card },
              draft.trim().length === 0 ? styles.addButtonDisabled : null,
            ])}>
            <Text style={[styles.addLabel, { color: colors.text }]}>+</Text>
          </RipplePressable>
        </View>

        <View style={styles.list}>
          {tasks.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>Пока пусто</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.row}>
                <RipplePressable
                  accessibilityLabel={task.done ? 'Вернуть задачу' : 'Отметить выполненной'}
                  onPress={() => toggleTask(task.id)}
                  style={styles.task}>
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: colors.muted },
                      task.done ? { backgroundColor: colors.mark, borderColor: colors.mark } : null,
                    ]}
                  />
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: task.done ? colors.muted : colors.text },
                      task.done ? styles.taskDone : null,
                    ]}>
                    {task.title}
                  </Text>
                </RipplePressable>
                <RipplePressable
                  accessibilityLabel="Удалить"
                  onPress={() => removeTask(task.id)}
                  style={styles.deleteButton}>
                  <Text style={[styles.deleteLabel, { color: colors.muted }]}>×</Text>
                </RipplePressable>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  count: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addLabel: {
    fontSize: 20,
    lineHeight: 22,
  },
  list: {
    paddingVertical: 6,
  },
  empty: {
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  task: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  taskDone: {
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 18,
    lineHeight: 20,
  },
});
