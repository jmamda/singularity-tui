import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { BOOT_LINE_COUNT, BOOT_TOTAL_MS, bootLineAt } from '../lib/effects.js';
import { packageVersion } from '../lib/version.js';

const TITLE = `S I N G U L A R I T Y   C L I   v${packageVersion()}`;
const BANNER_TOP = `  ╔═${'═'.repeat(TITLE.length + 4)}═╗`;
const BANNER_MID = `  ║   ${TITLE}   ║`;
const BANNER_BOT = `  ╚═${'═'.repeat(TITLE.length + 4)}═╝`;

interface Props {
  startedAt: number;
  cols: number;
  rows: number;
}

export function BootScreen({ startedAt, cols, rows }: Props) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, []);
  const elapsed = now - startedAt;
  const lines = Array.from({ length: BOOT_LINE_COUNT }, (_, i) => bootLineAt(elapsed, i));
  const stillTyping = elapsed < BOOT_TOTAL_MS - 400;
  const finalFlashOn = elapsed > BOOT_TOTAL_MS - 400 && Math.floor(elapsed / 100) % 2 === 0;

  return (
    <Box
      width={cols}
      height={rows}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box flexDirection="column">
        <Text color={color.primary} bold>
          {BANNER_TOP}
        </Text>
        <Text color={color.primary} bold>
          {BANNER_MID}
        </Text>
        <Text color={color.primary} bold>
          {BANNER_BOT}
        </Text>
        <Text> </Text>
        {lines.map((l, i) => (
          <Text
            key={i}
            color={
              l.endsWith('OK') ? color.accent : l.endsWith('ENGAGED') ? color.primary : color.text
            }
          >
            {l}
            {l.length > 0 && stillTyping ? <Text color={color.primary}>_</Text> : ''}
          </Text>
        ))}
        {!stillTyping ? (
          <>
            <Text> </Text>
            <Text color={finalFlashOn ? color.primary : color.accent} bold>
              {finalFlashOn ? '  ▣ CONSOLE ENGAGED ▣' : '  ▣                  ▣'}
            </Text>
          </>
        ) : null}
      </Box>
    </Box>
  );
}
