const CoreService = require('../CoreService')

class TrelloDefaultService extends CoreService {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static get type () { return CoreService.SERVICE_TYPES.DEFAULT }
  static get humanizedType () { return 'Trello' }
  static get humanizedLogos () {
    return [
      'images/trello/logo_32px.png',
      'images/trello/logo_48px.png',
      'images/trello/logo_64px.png',
      'images/trello/logo_128px.png'
    ]
  }

  /* **************************************************************************/
  // Properties
  /* **************************************************************************/

  get url () { return 'https://trello.com' }
  get sleepable () { return this._value_('sleepable', false) }

  /* **************************************************************************/
  // Properties : Messages & unread info
  /* **************************************************************************/

  get unreadNotifications () { return this._value_('unreadNotifications', []) }
  get unreadCount () { return this.unreadNotifications.length }

  /* **************************************************************************/
  // Properties : Provider Details & counts etc
  /* **************************************************************************/

  /**
  * Generates the notifications base text from the type of notification
  * @param notif: the notification to generate the text for
  * @return plain text notification string
  */
  _generateNotificationText (notif) {
    const username = (notif.memberCreator || {}).username || 'Someone'
    const cardname = (notif.data.card || {}).name || 'Unknown'
    const boardname = (notif.data.board || {}).name || 'Unknown'
    const orgname = (notif.data.organization || {}).name || 'Unknown'

    switch (notif.type) {
      case 'removedFromCard':
        return `@${username} removed you from the card ${cardname}`
      case 'addedToCard':
        return `@${username} added you to the card ${cardname}`
      case 'mentionedOnCard':
        return `@${username} mentioned you on the card ${cardname}`
      case 'commentCard':
        return `@${username} commented on the card ${cardname}`
      case 'changeCard':
        return `@${username} moved the card ${cardname}`
      case 'createdCard':
        return `@${username} created the card the card ${cardname}`
      case 'updateCheckItemStateOnCard':
        return `@${username} checked the card ${cardname}`
      case 'addedMemberToCard':
        return `@${username} joined the card ${cardname}`
      case 'removedMemberFromCard':
        return `@${username} left the card ${cardname}`
      case 'addedAttachmentToCard':
        return `@${username} added an attachment to the card ${cardname}`
      case 'addedToBoard':
        return `@${username} added you to the board ${boardname}`
      case 'removedFromBoard':
        return `@${username} removed you from the board ${boardname}`
      case 'invitedToBoard':
        return `@${username} invited you to the board ${boardname}`
      case 'addAdminToBoard':
        return `@${username} made you an admin of the board ${boardname}`
      case 'makeAdminOfBoard':
        return `@${username} made you an admin of the board ${boardname}`
      case 'closeBoard':
        return `@${username} closed the board ${boardname}`
      case 'removedFromOrganization':
        return `@${username} removed you from the organization ${orgname}`
      case 'invitedToOrganization':
        return `@${username} invited you to the organization ${orgname}`
      case 'addAdminToOrganization':
        return `@${username} made you an admin of the organization ${orgname}`
      case 'makeAdminOfOrganization':
        return `@${username} made you an admin of the organization ${orgname}`
      default: return ''
    }
  }

  get trayMessages () {
    return this.unreadNotifications.slice(0, 10).map((notif) => {
      return {
        id: notif.id,
        text: this._generateNotificationText(notif),
        date: new Date(notif.date).getTime(),
        data: {
          notificationId: notif.id,
          boardId: notif.data.board ? notif.data.board.id : undefined,
          cardId: notif.data.card ? notif.data.card.id : undefined,
          mailboxId: this.parentId,
          serviceType: this.type
        }
      }
    })
  }
  get notifications () {
    return this.unreadNotifications.slice(0, 10).map((notif) => {
      return {
        id: notif.id,
        title: this._generateNotificationText(notif),
        body: [
          { content: notif.data.text }
        ],
        timestamp: new Date(notif.date).getTime(),
        data: {
          notificationId: notif.id,
          boardId: notif.data.board ? notif.data.board.id : undefined,
          cardId: notif.data.card ? notif.data.card.id : undefined,
          mailboxId: this.parentId,
          serviceType: this.type
        }
      }
    })
  }
}

module.exports = TrelloDefaultService
