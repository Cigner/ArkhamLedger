import { Users } from 'lucide-react'
import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/patterns/page-header'
import { requireAdmin } from '@/lib/auth'
import { listUsersForAdmin } from '@/modules/identity/data/users'
import { CreateUserDialog } from '@/modules/identity/ui/admin/create-user-dialog'
import { UserRowActions } from '@/modules/identity/ui/admin/user-row-actions'
import { UserStatusBadge } from '@/modules/identity/ui/admin/user-status-badge'

/**
 * Account administration.
 *
 * The only screen that creates accounts. Both the layout and the query call
 * requireAdmin independently - the duplication is deliberate, since a query must
 * not rely on having been reached through a particular layout.
 */
export const metadata: Metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  const users = await listUsersForAdmin()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Users"
        icon={<Users className="size-6" strokeWidth={1.5} />}
        description="Created here, activated by their owner through a link."
        actions={<CreateUserDialog />}
      />

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  {user.name}
                  {user.id === admin.id ? (
                    <span className="ml-2 font-ui text-xs text-text-muted">(you)</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-text-secondary">{user.email}</TableCell>
                <TableCell>
                  {user.role === 'admin' ? (
                    <Badge variant="candle">Administrator</Badge>
                  ) : (
                    <Badge variant="muted">User</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <UserStatusBadge status={user.status} />
                </TableCell>
                <TableCell>
                  <UserRowActions user={user} isSelf={user.id === admin.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}
