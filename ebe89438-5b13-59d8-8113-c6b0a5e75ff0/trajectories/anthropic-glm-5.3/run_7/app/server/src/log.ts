type Fields = Record<string, unknown>;

const line = (level: string, msg: string, fields?: Fields) => {
  const base = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  process.stdout.write(JSON.stringify(base) + '\n');
};

export const log = {
  info: (msg: string, fields?: Fields) => line('info', msg, fields),
  warn: (msg: string, fields?: Fields) => line('warn', msg, fields),
  error: (msg: string, fields?: Fields) => line('error', msg, fields),
};
