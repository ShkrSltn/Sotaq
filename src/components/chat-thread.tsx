import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

type Message = {
  id: string;
  text: string;
};

const palette = {
  light: {
    column: '#FFFFFF',
    bubble: '#16181D',
    bubbleText: '#F3F4F6',
    text: '#16181D',
    muted: '#8B909A',
    line: '#E6E8EC',
    field: '#F6F7F8',
  },
  dark: {
    column: '#1C1D21',
    bubble: '#F3F4F6',
    bubbleText: '#16181D',
    text: '#F3F4F6',
    muted: '#9AA0A8',
    line: '#2C2E33',
    field: '#26272C',
  },
} as const;

export function ChatThread() {
  const colors = palette[useResolvedColorScheme()];
  const nextId = useRef(1);
  const listRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');

  function send() {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const id = String(nextId.current);
    nextId.current += 1;
    setMessages((current) => [...current, { id, text }]);
    setDraft('');
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.panel, { backgroundColor: colors.column }]}>
        <View style={[styles.header, { borderBottomColor: colors.line }]}>
          <Text style={[styles.title, { color: colors.text }]}>Чат</Text>
          <Text style={[styles.note, { color: colors.muted }]}>без ответов</Text>
        </View>

        <ScrollView
          ref={listRef}
          style={styles.messages}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Напиши сообщение. Ответов пока нет.
            </Text>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubble, { backgroundColor: colors.bubble }]}>
                <Text style={[styles.bubbleText, { color: colors.bubbleText }]}>{message.text}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: colors.line }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Сообщение"
            placeholderTextColor={colors.muted}
            returnKeyType="send"
            style={[styles.input, { color: colors.text, backgroundColor: colors.field }]}
          />
          <RipplePressable
            accessibilityLabel="Отправить"
            disabled={draft.trim().length === 0}
            onPress={send}
            style={StyleSheet.flatten([
              styles.sendButton,
              { backgroundColor: colors.bubble },
              draft.trim().length === 0 ? styles.sendButtonDisabled : null,
            ])}>
            <Text style={[styles.sendLabel, { color: colors.bubbleText }]}>↑</Text>
          </RipplePressable>
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
  },
  messages: {
    flex: 1,
  },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendLabel: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
});
