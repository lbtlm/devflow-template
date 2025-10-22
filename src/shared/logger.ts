type LogLevel = 'info' | 'warn' | 'error';

const format = (level: LogLevel, message: string) => {
  const label = level.toUpperCase().padEnd(5, ' ');
  return `[${label}] ${message}`;
};

export const logger = {
  info: (message: string) => {
    console.log(format('info', message));
  },
  warn: (message: string) => {
    console.warn(format('warn', message));
  },
  error: (message: string) => {
    console.error(format('error', message));
  }
};
