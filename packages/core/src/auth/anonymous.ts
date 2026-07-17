export const ANONYMOUS_USER_ID = 'anonymous';

export const isAnonymous = (userId: string) => userId === ANONYMOUS_USER_ID;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ANONYMOUS_USER = {
  id: ANONYMOUS_USER_ID,
  name: 'Anonymous',
  email: 'anonymous@system.teable.ai',
};

export const MOCHI_LOCAL_AUTH_DISABLED = process.env.MOCHI_LOCAL_AUTH_DISABLED === 'true';

export const MOCHI_LOCAL_USER_ID = 'mochi_local_owner';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const MOCHI_LOCAL_USER = {
  id: MOCHI_LOCAL_USER_ID,
  name: 'Mochi Local',
  email: 'local@mochi.table',
  avatar: null,
  phone: null,
  notifyMeta: {},
  hasPassword: false,
  isAdmin: true,
  lang: null,
};
