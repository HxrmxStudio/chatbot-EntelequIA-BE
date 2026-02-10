import {
  mapConversationHistoryRowsToMessageHistoryItems,
  type ConversationHistoryRow,
} from '@/modules/wf1/domain/conversation-history';

describe('mapConversationHistoryRowsToMessageHistoryItems', () => {
  it('reverses newest-first rows into chronological history items', () => {
    const rows: ConversationHistoryRow[] = [
      {
        id: 'm2',
        content: 'segundo',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-10T00:00:02.000Z',
      },
      {
        id: 'm1',
        content: 'primero',
        sender: 'user',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-10T00:00:01.000Z',
      },
    ];

    const history = mapConversationHistoryRowsToMessageHistoryItems(rows);

    expect(history).toEqual([
      { sender: 'user', content: 'primero', createdAt: '2026-02-10T00:00:01.000Z' },
      { sender: 'bot', content: 'segundo', createdAt: '2026-02-10T00:00:02.000Z' },
    ]);
  });

  it('drops rows with missing or invalid fields', () => {
    const rows: ConversationHistoryRow[] = [
      {
        id: 'm1',
        content: null,
        sender: 'user',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-10T00:00:01.000Z',
      },
      {
        id: 'm2',
        content: 'ok',
        sender: 'unknown',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-10T00:00:02.000Z',
      },
      {
        id: 'm3',
        content: 'ok',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: null,
      },
      {
        id: 'm4',
        content: 'ok',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-10T00:00:04.000Z',
      },
    ];

    const history = mapConversationHistoryRowsToMessageHistoryItems(rows);

    expect(history).toEqual([
      { sender: 'bot', content: 'ok', createdAt: '2026-02-10T00:00:04.000Z' },
    ]);
  });
});
