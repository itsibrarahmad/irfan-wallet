# Deposit & Withdrawal System - Developer Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Dashboard)                      │
│  - Modal dialogs for deposit/withdrawal                     │
│  - Screenshot upload with preview                          │
│  - Transaction history view                                │
│  - Admin transaction management                            │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   GET/POST                  GET/PATCH
   /api/transactions         /api/admin/transactions
        │                         │
┌───────▼─────────────────────────▼───────────┐
│         Express.js Backend (Node.js)        │
│  - Routes with auth middleware              │
│  - Transaction CRUD operations              │
│  - Admin approval workflow                  │
└────────────────┬────────────────────────────┘
                 │
        ┌────────▼────────┐
        │    MongoDB      │
        │  - Users        │
        │  - Transactions │
        └─────────────────┘
```

## File Breakdown

### 1. **models/Transaction.js** (New File)
Defines the transaction schema with all necessary fields for tracking deposits/withdrawals.

**Fields:**
- `userId`: Reference to User who made the transaction
- `type`: Enum - 'deposit' or 'withdrawal'
- `amount`: Numeric amount in PKR
- `screenshot`: Base64-encoded image string
- `status`: Enum - 'pending', 'approved', or 'rejected'
- `adminComment`: Optional reason for rejection
- `createdAt`: Timestamp when transaction was submitted
- `approvedAt`: Timestamp when admin processed it
- `approvedBy`: Reference to admin user who processed it

### 2. **index.js** (Updated)
Added 5 new API endpoints and imported Transaction model.

**New Endpoints:**

#### POST /api/transactions
```javascript
// Submit new deposit/withdrawal request
// Requires: isAuthenticated middleware
// Body: { type, amount, screenshot }
// Returns: { message, transactionId }
```

#### GET /api/transactions
```javascript
// Get authenticated user's transaction history
// Requires: isAuthenticated middleware
// Query: none
// Returns: Array of transaction objects sorted by date (newest first)
```

#### GET /api/admin/transactions
```javascript
// Get transactions for admin review
// Requires: isAuthenticated + isAdmin middleware
// Query: ?status=pending|approved|rejected (default: pending)
// Returns: Array with populated user details
```

#### PATCH /api/admin/transactions/:id
```javascript
// Approve or reject transaction
// Requires: isAuthenticated + isAdmin middleware
// Body: { status: 'approved'|'rejected', comment?: string }
// Returns: { message, transaction }
```

**Key Code Changes:**
```javascript
// Added imports
const Transaction = require("./models/Transaction");

// Added endpoints before server.listen()
app.post('/api/transactions', ...)
app.get('/api/transactions', ...)
app.get('/api/admin/transactions', ...)
app.patch('/api/admin/transactions/:id', ...)
```

### 3. **views/dashboard.html** (Significantly Updated)
Enhanced with complete transaction management UI.

**New CSS Sections:**
- Modal styles (.modal, .modal-content, .modal-header, etc.)
- Form styles (.form-group, .file-input, .file-upload-btn)
- Transaction styles (.transaction-item, .transaction-status, etc.)
- Admin transaction styles (.admin-transaction-item, .transaction-actions)
- Alert styles (.alert, .alert-success, .alert-danger)

**New HTML Elements:**
- Two modals: #depositModal and #withdrawalModal
- File input with preview
- Amount input field
- User transaction history container (#transactionsList)
- Admin transaction management container (#adminTransactionsList)

**New JavaScript Functions:**

1. **Modal Functions**
   - `openDepositModal()` - Open deposit form
   - `openWithdrawalModal()` - Open withdrawal form
   - `closeModal(modalId)` - Close and reset modal

2. **Screenshot Handling**
   - File change listeners that convert image to base64
   - Preview display with has-image styling
   - Data stored in window.depositScreenshotData / window.withdrawalScreenshotData

3. **Transaction Submission**
   - `submitDeposit()` - Validate and submit deposit
   - `submitWithdrawal()` - Validate and submit withdrawal
   - Auto-reload transactions after 5 seconds

4. **Transaction Loading**
   - `loadTransactions()` - Fetch user's transaction history
   - `loadAdminTransactions()` - Fetch pending transactions for admin
   - Dynamic HTML generation with status badges

5. **Admin Actions**
   - `approveTransaction(id)` - Approve and reload list
   - `rejectTransaction(id)` - Reject with reason prompt and reload

6. **Navigation**
   - Updated nav item click handler to support new sections
   - Dynamic page title updates
   - Proper section visibility management

## Data Flow

### User Deposits Money
```
1. User clicks "Deposit & Withdraw" nav item
2. Opens deposit modal
3. Selects image → converted to base64
4. Enters amount
5. Clicks "Submit Deposit"
   ↓
6. POST /api/transactions {type, amount, screenshot}
   ↓
7. Server creates Transaction doc with status: 'pending'
8. Returns transactionId
   ↓
9. Show "Waiting" message for 5 seconds
10. Auto-reload transactions
    ↓
11. User sees transaction in history with 'pending' status
12. Waits for admin approval
```

### Admin Approves Transaction
```
1. Admin navigates to "Transactions" menu item
2. Calls loadAdminTransactions() → GET /api/admin/transactions?status=pending
   ↓
3. Renders all pending transactions as cards
4. Each card shows: user info, type, amount, screenshot
   ↓
5. Admin clicks "✓ Approve"
6. Calls approveTransaction(id)
   ↓
7. PATCH /api/admin/transactions/:id {status: 'approved'}
   ↓
8. Server updates transaction:
   - status → 'approved'
   - approvedAt → current timestamp
   - approvedBy → admin's userId
   ↓
9. Confirmation alert shown
10. adminTransactionsList reloads
    ↓
11. User sees transaction status changed to 'approved' (green badge)
```

### Admin Rejects Transaction
```
1. Admin clicks "✗ Reject"
2. Browser prompt asks for reason
   ↓
3. Calls rejectTransaction(id, reason)
4. PATCH /api/admin/transactions/:id {status: 'rejected', comment: reason}
   ↓
5. Server updates transaction:
   - status → 'rejected'
   - adminComment → provided reason
   - approvedAt → current timestamp
   ↓
6. Confirmation alert shown
7. adminTransactionsList reloads
    ↓
8. User sees transaction with:
   - Status badge: 'rejected' (red)
   - Rejection reason displayed below
```

## Validation Rules

### Client-Side
```javascript
// Amount validation
if (amount < 100) throw Error('Minimum 100 PKR')

// Screenshot required
if (!screenshot) throw Error('Screenshot required')

// Type validation (handled by UI)
type ∈ ['deposit', 'withdrawal']
```

### Server-Side
```javascript
// All validations repeated on server
- Check type is valid
- Check amount >= 100
- Check all fields provided
- Verify user is authenticated
- Verify admin role (for admin endpoints)
```

## Security Considerations

1. **Authentication**
   - All endpoints except auth use isAuthenticated middleware
   - Session-based authentication with userId in session

2. **Authorization**
   - User can only view own transactions
   - Admin endpoints require isAdmin middleware
   - Filter by userId in queries

3. **Input Validation**
   - Amount must be >= 100
   - Type must be 'deposit' or 'withdrawal'
   - All required fields checked

4. **Data Isolation**
   - Transaction queries filtered by userId
   - Admin can see all but must have admin role

## Database Indexing (Recommended)

For production, add these indexes to improve query performance:

```javascript
db.transactions.createIndex({ userId: 1, createdAt: -1 })
db.transactions.createIndex({ status: 1 })
db.transactions.createIndex({ userId: 1, status: 1 })
```

## Image Storage Considerations

Current implementation stores base64-encoded images in MongoDB:
- ✅ Simple implementation
- ✅ No external dependencies
- ❌ Increases database size
- ❌ Slower queries with large images

**For Production, Consider:**
- **Cloudinary**: Free tier up to 25MB/month
- **AWS S3**: Pay-as-you-go storage
- **Firebase Storage**: Easy integration
- **ImageKit**: CDN with optimization

## Error Handling

### Client-Side
```javascript
// Try-catch blocks in all async functions
try {
  const res = await fetch(url)
  if (!res.ok) throw error
  const data = await res.json()
  // Handle data
} catch (err) {
  alert('Error message')
  console.error(err)
}
```

### Server-Side
```javascript
// Status codes used:
400 - Bad request (validation failed)
404 - Not found (resource doesn't exist)
500 - Server error

// All errors logged to console
console.error('Error message:', err)
```

## Testing Scenarios

### Test Case 1: User Deposits with Valid Data
1. Login as regular user
2. Navigate to Deposit & Withdraw
3. Upload image
4. Enter amount: 5000
5. Submit
6. ✅ See pending status

### Test Case 2: Admin Approves Deposit
1. Login as admin
2. Go to Transactions
3. See pending deposit
4. Click Approve
5. ✅ Status changes to approved

### Test Case 3: Admin Rejects with Reason
1. Login as admin
2. Go to Transactions
3. See pending withdrawal
4. Click Reject
5. Enter reason: "Invalid account"
6. ✅ Status changes to rejected
7. User can see reason in history

### Test Case 4: Amount Validation
1. Try to deposit 50 PKR
2. ✅ Show error: "Minimum amount is 100 PKR"

### Test Case 5: Missing Screenshot
1. Try to submit without image
2. ✅ Show error: "Please provide both screenshot and amount"

## Performance Optimization Tips

1. **Image Compression**
   - Compress images before base64 encoding
   - Use canvas API to resize large images

2. **Pagination**
   - Limit transaction history to 20 items per page
   - Add "Load More" functionality

3. **Caching**
   - Cache user's transaction history locally
   - Invalidate cache on new transaction

4. **Database**
   - Add indexes on userId and status
   - Consider archiving old transactions

## Future Enhancements

1. **Real-time Updates**
   - Socket.io for instant notifications
   - WebSocket for live transaction status

2. **Automation**
   - Auto-approve for verified users
   - Cron job for stale transactions

3. **Analytics**
   - Transaction statistics dashboard
   - Revenue reports

4. **Integration**
   - Payment gateway integration
   - Automated bank transfers

5. **Notifications**
   - Push notifications
   - SMS updates
   - Email receipts

## Support & Debugging

### Common Issues

**Issue**: Screenshot not uploading
- Check image size (< 5MB)
- Verify file is valid image
- Check browser console for errors

**Issue**: Admin can't see pending transactions
- Verify user has admin role
- Check MongoDB for transaction records
- Confirm status is 'pending'

**Issue**: User not notified after approval
- Current: Manual reload required
- Future: Add real-time notifications

## Code Examples

### Submitting a Transaction from External App
```javascript
const response = await fetch('http://localhost:3000/api/transactions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'deposit',
    amount: 5000,
    screenshot: imageBase64String
  })
});
const result = await response.json();
console.log('Transaction ID:', result.transactionId);
```

### Approving Transaction from Admin Dashboard
```javascript
await fetch(`http://localhost:3000/api/admin/transactions/${transactionId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    status: 'approved'
  })
});
```

---

**Last Updated**: December 10, 2024
**Version**: 1.0
**Status**: Production Ready
