// A refusal is a shared value type. It carries a status and a body that names
// what was refused and what would change it. Both the arithmetic layer and the
// route layer raise one; neither depends on the other to do it.

export class Refusal extends Error {
  constructor(status, body) {
    super(body?.error || 'refused');
    this.status = status;
    this.body = body;
  }
}

export function refuse(status, error, detail, extra = {}) {
  return new Refusal(status, { error, detail, ...extra });
}
