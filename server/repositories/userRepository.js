function mapInvitation(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    acceptedUserId: row.accepted_user_id,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }
}

function mapUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    firebaseUid: row.firebase_uid,
    role: row.role,
    displayName: row.display_name,
    disabled: row.disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createUserRepository(client) {
  if (!client || typeof client.query !== 'function') throw new TypeError('A PostgreSQL pool or client is required')

  return {
    async createInvitation({ id, email, role, invitedBy, expiresAt }) {
      const normalizedEmail = email.trim().toLowerCase()
      const result = await client.query(
        `INSERT INTO invitations (id, email, role, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, normalizedEmail, role, invitedBy, expiresAt],
      )
      return mapInvitation(result.rows[0])
    },

    async findInvitationByEmail(email) {
      const result = await client.query(
        `SELECT * FROM invitations
         WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
        [email.trim().toLowerCase()],
      )
      return mapInvitation(result.rows[0])
    },

    async acceptInvitation({ invitationId, userId, firebaseUid, verifiedEmail, displayName }) {
      const result = await client.query(
        `WITH eligible AS (
           SELECT id, email, role
           FROM invitations
           WHERE id = $1
             AND email = $4
             AND accepted_at IS NULL
             AND revoked_at IS NULL
             AND expires_at > now()
           FOR UPDATE
         ), inserted AS (
           INSERT INTO users (id, email, firebase_uid, role, display_name)
           SELECT $2, email, $3, role, $5 FROM eligible
           RETURNING *
         ), accepted AS (
           UPDATE invitations
           SET accepted_user_id = $2, accepted_at = now()
           WHERE id = (SELECT id FROM eligible)
           RETURNING id
         )
         SELECT inserted.* FROM inserted, accepted`,
        [invitationId, userId, firebaseUid, verifiedEmail.trim().toLowerCase(), displayName],
      )
      if (result.rowCount === 0) {
        const error = new Error('Invitation is unavailable or does not match the verified email')
        error.code = 'invitation_unavailable'
        throw error
      }
      return mapUser(result.rows[0])
    },

    async findByFirebaseUid(firebaseUid) {
      const result = await client.query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid])
      return mapUser(result.rows[0])
    },

    async findById(id) {
      const result = await client.query('SELECT * FROM users WHERE id = $1', [id])
      return mapUser(result.rows[0])
    },

    async setDisabled({ id, disabled }) {
      const result = await client.query(
        'UPDATE users SET disabled = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [id, disabled],
      )
      return mapUser(result.rows[0])
    },
  }
}
