import { PASSWORD_RESET_TTL_MINUTES } from './constants'

/**
 * Account email bodies.
 *
 * Pure functions with no transport dependency, which is what lets them live in
 * the domain layer and be imported by the auth wrapper without inverting the
 * dependency direction.
 *
 * Plain text only. These are security emails: HTML adds a rendering surface and
 * a phishing-lookalike problem for no benefit, and the whole message is two
 * sentences and a link.
 *
 * The copy states the expiry and says what to do if the recipient did not ask
 * for it, because that is the only signal a user gets that someone else is
 * trying to reach their account.
 */
export type MailBody = { subject: string; text: string }

export function passwordResetEmail(name: string, url: string): MailBody {
  return {
    subject: 'Reset your Arkham Ledger password',
    text: [
      `Hello ${name},`,
      '',
      'Someone asked to reset the password for your Arkham Ledger account.',
      'Open the link below to choose a new one:',
      '',
      url,
      '',
      `The link stops working in ${PASSWORD_RESET_TTL_MINUTES} minutes and can be used once.`,
      '',
      'If this was not you, no action is needed — your password has not changed.',
      'It is worth telling whoever administers your group, though.',
    ].join('\n'),
  }
}

export function passwordChangedEmail(name: string): MailBody {
  return {
    subject: 'Your Arkham Ledger password was changed',
    text: [
      `Hello ${name},`,
      '',
      'The password for your Arkham Ledger account has just been changed,',
      'and every other signed-in session has been ended.',
      '',
      'If this was not you, contact whoever administers your group immediately.',
    ].join('\n'),
  }
}
