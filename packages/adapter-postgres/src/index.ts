import { Adapter, AdapterUser, VerificationToken } from "next-auth/adapters";
import { Pool } from "pg";

export default function PostgresAdapter(client: Pool): Adapter {
  return {
    async createVerificationToken(verificationToken: VerificationToken): Promise<VerificationToken> {
      const { identifier, expires, token } = verificationToken;
      const sql = `
        INSERT INTO verification_token ( identifier, expires, token ) 
        VALUES ($1, $2, $3)
        `;
      await client.query(sql, [identifier, expires, token]);
      return verificationToken;
    },
    async useVerificationToken({ identifier, token }: { identifier: string; token: string }): Promise<VerificationToken> {
      token;
      const sql = `delete from verification_token where identifier = $1 RETURNING  identifier, expires, token `;
      const result = await client.query(sql, [identifier]);
      return result.rows[0];
    },

    async createUser(user: Omit<AdapterUser, 'id'>) {
      const { name, email, emailVerified, image } = user;
      const sql = `
        INSERT INTO users (name, email, email_verified, image) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id, name, email, email_verified, image`;
      const result = await client.query(sql, [name, email, emailVerified, image]);
      return result.rows[0];
    },
    async getUser(id) {
      const sql = `select * from users where id = $1`;
      const result = await client.query(sql, [id]);
      return result.rows[0];
    },
    async getUserByEmail(email) {
      const sql = `select * from users where email = $1`;
      const result = await client.query(sql, [email]);
      return result.rows[0];
    },
    async getUserByAccount({ providerAccountId, provider }) {
      const sql = `
          select u.* from users u join accounts a on u.id = a.user_id 
          where 
          a.provider_id = $1 
          and 
          a.provider_account_id = $2`;

      const result = await client.query(sql, [provider, providerAccountId]);
      return result.rows[0];
    },
    async updateUser(user: Partial<AdapterUser>): Promise<AdapterUser> {
      const { id, name, email, emailVerified, image } = user;
      const sql = `
        UPDATE users set
        name = $2, email = $3, email_verified = $4, image = $5
        where id = $1
        RETURNING name, email, email_verified, image
        `;
      const result = await client.query(sql, [id, name, email, emailVerified, image]);
      return result.rows[0];
    },
    async linkAccount(account) {
      const sql = `
        insert into accounts 
        (
          user_id, 
          provider_id, 
          provider_type, 
          provider_account_id, 
          access_token,
          access_token_expires
        )
        values ($1, $2, $3, $4, $5, to_timestamp($6))`;

      const params = [
        account.userId,
        account.provider,
        account.type,
        account.providerAccountId,
        account.access_token,
        account.expires_at,
      ];

      await client.query(sql, params);
      return account;
    },
    async createSession({ sessionToken, userId, expires }) {
      if (userId === undefined) {
        throw Error(`userId is undef in createSession`)
      }
      const sql = `insert into sessions (user_id, expires, session_token)
      values ($1, $2, $3)
      RETURNING id, session_token, user_id, expires`;

      const result = await client.query(sql, [userId, expires, sessionToken]);
      if (result.rowCount === 0) {
        throw new Error(`No session returned from createSession`);
      }
      const session = result.rows[0];
      return session;
    },

    async getSessionAndUser(sessionToken: string | undefined) {
      // Error occurs here: sessionToken is undefined, and signin after clicking on an email signin
      // link fails (user stays signed out),
      // I'm unable to figure out what causes this
      if (sessionToken === undefined) {
        return null;
        // throw new Error(`sessiontoken undef, what my stack`)
      }
      const result1 = await client.query("select * from sessions where session_token = $1", [sessionToken]);
      if (result1.rowCount === 0) {
        return null
      }
      let session = result1.rows[0];

      const result2 = await client.query("select * from users where id = $1", [session.user_id]);
      if (result2.rowCount === 0) {
        return null
      }
      const user = result2.rows[0];

      return {
        session,
        user,
      };
    },
    async updateSession({ sessionToken }) {
      // noop for now.
      return null;
    },
    async deleteSession(sessionToken) {
      const sql = `delete from sessions where session_token = $1`;
      await client.query(sql, [sessionToken]);
    },
  };
}
