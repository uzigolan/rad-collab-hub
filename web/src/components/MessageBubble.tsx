import { memo } from 'react';
import { Box, Text } from '@primer/react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  message: ChatMessage;
}

export const MessageBubble = memo(function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1,
        px: 2,
      }}
    >
      <Box
        sx={{
          maxWidth: '85%',
          px: '10px',
          py: '6px',
          borderRadius: 2,
          bg: isUser
            ? 'accent.subtle'
            : isSystem
            ? 'attention.subtle'
            : 'canvas.subtle',
          border: '1px solid',
          borderColor: isUser
            ? 'accent.muted'
            : isSystem
            ? 'attention.muted'
            : 'border.default',
        }}
      >
        <Box sx={{ fontSize: 1, color: '#e6edf3', '& p': { m: 0, mb: 1 }, '& p:last-child': { mb: 0 }, '& p:first-of-type': { display: 'inline' }, '& pre': { bg: 'canvas.inset', p: 2, borderRadius: 2, overflow: 'auto', fontSize: 0 }, '& code': { bg: 'canvas.inset', px: 1, borderRadius: 1, fontSize: '85%' }, '& table': { borderCollapse: 'collapse', width: '100%', my: 2, fontSize: 0 }, '& th, & td': { border: '1px solid', borderColor: 'border.default', px: 2, py: 1, textAlign: 'left' }, '& th': { bg: 'canvas.inset', fontWeight: 'bold' }, '& tr:nth-of-type(even)': { bg: 'canvas.inset' } }}>
          {!isUser && <span style={{ fontSize: '12px', marginRight: 4, verticalAlign: 'middle' }}>{isSystem ? '⚙️' : '🤖'}</span>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </Box>
        <Text sx={{ fontSize: '10px', color: 'fg.muted', display: 'block', textAlign: isUser ? 'right' : 'left', mt: '2px' }}>
          {time}
        </Text>
      </Box>
    </Box>
  );
});
