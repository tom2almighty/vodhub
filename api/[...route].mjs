import { handle } from 'hono/vercel';
import app from '../server/app.mjs';

export const config = { runtime: 'edge' };
export default handle(app);
