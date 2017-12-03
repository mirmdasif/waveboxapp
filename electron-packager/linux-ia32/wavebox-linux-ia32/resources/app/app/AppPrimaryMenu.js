const { Menu, shell, dialog } = require('electron')
const mailboxStore = require('./stores/mailboxStore')
const settingStore = require('./stores/settingStore')
const { GITHUB_URL, GITHUB_ISSUE_URL, WEB_URL, PRIVACY_URL } = require('../shared/constants')
const Release = require('../shared/Release')
const pkg = require('../package.json')
const MenuTool = require('../shared/Electron/MenuTool')
const electronLocalshortcut = require('electron-localshortcut')
var open = require('open')

class AppPrimaryMenu {
  /* ****************************************************************************/
  // Selectors
  /* ****************************************************************************/

  /**
  * Builds the selector index for the primary menu manager
  * @param windowManager: the window manager instance the callbacks can call into
  * @return the selectors map
  */
  static buildSelectors (windowManager) {
    return {
      fullQuit: () => {
        windowManager.quit()
      },
      closeWindow: () => {
        const focused = windowManager.focused()
        if (focused) { focused.close() }
      },
      showWindow: () => {
        windowManager.mailboxesWindow.show().focus()
      },
      fullscreenToggle: () => {
        const focused = windowManager.focused()
        if (focused) { focused.toggleFullscreen() }
      },
      sidebarToggle: () => {
        windowManager.mailboxesWindow.show().focus().toggleSidebar()
      },
      menuToggle: () => {
        windowManager.mailboxesWindow.show().focus().toggleAppMenu()
      },
      preferences: () => {
        windowManager.mailboxesWindow.show().focus().launchPreferences()
      },
      addAccount: () => {
        windowManager.mailboxesWindow.show().focus().addAccount()
      },
      composeMail: () => {
        windowManager.mailboxesWindow.show().focus().openMailtoLink('mailto://')
      },
      reload: () => {
        const focused = windowManager.focused()
        if (focused) { focused.reload() }
      },
      devTools: () => {
        const focused = windowManager.focused()
        if (focused) { focused.openDevTools() }
      },
      learnMoreGithub: () => { open(GITHUB_URL, 'chromium-browser') },
      learnMore: () => { shell.openExternal(WEB_URL) },
      privacy: () => { shell.openExternal(PRIVACY_URL) },
      bugReport: () => { shell.openExternal(GITHUB_ISSUE_URL) },
      zoomIn: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomIn() }
      },
      zoomOut: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomOut() }
      },
      zoomReset: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomReset() }
      },
      changeMailbox: (mailboxId, serviceType = undefined) => {
        windowManager.mailboxesWindow.show().focus().switchMailbox(mailboxId, serviceType)
      },
      changeMailboxServiceToIndex: (index) => {
        windowManager.mailboxesWindow.show().focus().switchToServiceAtIndex(index)
      },
      prevMailbox: () => {
        windowManager.mailboxesWindow.show().focus().switchPrevMailbox(true)
      },
      nextMailbox: () => {
        windowManager.mailboxesWindow.show().focus().switchNextMailbox(true)
      },
      cycleWindows: () => { windowManager.focusNextWindow() },
      aboutDialog: () => {
        dialog.showMessageBox({
          title: pkg.name,
          message: pkg.name,
          detail: [
            Release.generateVersionString(pkg, '\n'),
            'Made with ♥ at wavebox.io'
          ].filter((l) => !!l).join('\n'),
          buttons: [ 'Done', 'Website' ]
        }, (index) => {
          if (index === 1) {
            shell.openExternal(WEB_URL)
          }
        })
      },
      checkForUpdate: () => {
        windowManager.mailboxesWindow.show().focus().userCheckForUpdate()
      },
      find: () => {
        const focused = windowManager.focused()
        if (focused) { focused.findStart() }
      },
      findNext: () => {
        const focused = windowManager.focused()
        if (focused) { focused.findNext() }
      },
      mailboxNavBack: () => {
        const focused = windowManager.focused()
        if (focused) { focused.navigateBack() }
      },
      mailboxNavForward: () => {
        const focused = windowManager.focused()
        if (focused) { focused.navigateForward() }
      }
    }
  }

  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor (selectors) {
    this._selectors = selectors
    this._lastAccelerators = null
    this._lastMailboxes = null
    this._lastActiveMailbox = null
    this._lastActiveServiceType = null
    this._lastMenu = null

    mailboxStore.on('changed', () => {
      this.handleMailboxesChanged()
    })
    settingStore.on('changed:accelerators', (evt) => {
      this.handleAcceleratorsChanged(evt)
    })
  }

  /* ****************************************************************************/
  // Creating
  /* ****************************************************************************/

  /**
  * Builds the menu
  * @param accelerators: the accelerators to use
  * @param mailboxes: the list of mailboxes
  * @param activeMailbox: the active mailbox
  * @param activeServiceType: the type of the active service
  * @return the new menu
  */
  build (accelerators, mailboxes, activeMailbox, activeServiceType) {
    return Menu.buildFromTemplate([
      {
        label: process.platform === 'darwin' ? 'Application' : 'File',
        submenu: [
          {
            label: 'About',
            click: this._selectors.aboutDialog
          },
          {
            label: 'Check for Update',
            click: this._selectors.checkForUpdate
          },
          { type: 'separator' },
          {
            label: 'Add Account',
            click: this._selectors.addAccount
          },
          {
            label: 'Preferences',
            click: this._selectors.preferences,
            accelerator: accelerators.preferences
          },
          { type: 'separator' },
          {
            label: 'Compose Mail',
            click: this._selectors.composeMail,
            accelerator: accelerators.composeMail
          },
          { type: 'separator' },
          process.platform === 'darwin' ? { label: 'Services', role: 'services', submenu: [] } : undefined,
          process.platform === 'darwin' ? { type: 'separator' } : undefined,
          {
            label: 'Show Window',
            click: this._selectors.showWindow,
            accelerator: accelerators.showWindow
          },
          {
            label: 'Hide Window',
            click: this._selectors.closeWindow,
            accelerator: accelerators.hideWindow
          },
          {
            label: 'Hide',
            role: 'hide',
            accelerator: accelerators.hide
          },
          {
            label: 'Hide Others',
            role: 'hideothers',
            accelerator: accelerators.hideOthers
          },
          {
            label: 'Show All',
            role: 'unhide'
          },
          { type: 'separator' },
          {
            label: 'Quit',
            click: this._selectors.fullQuit,
            accelerator: accelerators.quit
          }
        ].filter((item) => item !== undefined)
      },
      {
        label: 'Edit',
        submenu: [
          {
            label: 'Undo',
            role: 'undo',
            accelerator: accelerators.undo
          },
          {
            label: 'Redo',
            role: 'redo',
            accelerator: accelerators.redo
          },
          { type: 'separator' },
          {
            label: 'Cut',
            role: 'cut',
            accelerator: accelerators.cut
          },
          {
            label: 'Copy',
            role: 'copy',
            accelerator: accelerators.copy
          },
          {
            label: 'Paste',
            role: 'paste',
            accelerator: accelerators.paste
          },
          {
            label: 'Paste and match style',
            role: 'pasteandmatchstyle',
            accelerator: accelerators.pasteAndMatchStyle
          },
          {
            label: 'Select All',
            role: 'selectall',
            accelerator: accelerators.selectAll
          },
          { type: 'separator' },
          {
            label: 'Find',
            click: this._selectors.find,
            accelerator: accelerators.find
          },
          {
            label: 'Find Next',
            click: this._selectors.findNext,
            accelerator: accelerators.findNext
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Full Screen',
            click: this._selectors.fullscreenToggle,
            accelerator: accelerators.toggleFullscreen
          },
          {
            label: 'Toggle Sidebar',
            click: this._selectors.sidebarToggle,
            accelerator: accelerators.toggleSidebar
          },
          process.platform === 'darwin' ? undefined : {
            label: 'Toggle Menu',
            click: this._selectors.menuToggle,
            accelerator: accelerators.toggleMenu
          },
          { type: 'separator' },
          {
            label: 'Navigate Back',
            click: this._selectors.mailboxNavBack,
            accelerator: accelerators.navigateBack
          },
          {
            label: 'Navigate Forward',
            click: this._selectors.mailboxNavForward,
            accelerator: accelerators.navigateForward
          },
          { type: 'separator' },
          {
            label: 'Zoom In',
            click: this._selectors.zoomIn,
            accelerator: accelerators.zoomIn
          },
          {
            label: 'Zoom Out',
            click: this._selectors.zoomOut,
            accelerator: accelerators.zoomOut
          },
          {
            label: 'Reset Zoom',
            click: this._selectors.zoomReset,
            accelerator: accelerators.zoomReset
          },
          { type: 'separator' },
          {
            label: 'Reload',
            click: this._selectors.reload,
            accelerator: accelerators.reload
          },
          {
            label: 'Developer Tools',
            click: this._selectors.devTools,
            accelerator: accelerators.developerTools
          }
        ].filter((item) => item !== undefined)
      },
      {
        label: 'Window',
        role: 'window',
        submenu: [
          {
            label: 'Minimize',
            role: 'minimize',
            accelerator: accelerators.minimize
          },
          {
            label: 'Cycle Windows',
            click: this._selectors.cycleWindows,
            accelerator: accelerators.cycleWindows
          }
        ]
        .concat(mailboxes.length <= 1 ? [] : [
          { type: 'separator' },
          {
            label: 'Previous Mailbox',
            click: this._selectors.prevMailbox,
            accelerator: accelerators.previousMailbox
          },
          {
            label: 'Next Mailbox',
            click: this._selectors.nextMailbox,
            accelerator: accelerators.nextMailbox
          }
        ])
        .concat(mailboxes.length <= 1 ? [] : [{ type: 'separator' }])
        .concat(mailboxes.length <= 1 ? [] : mailboxes.map((mailbox, index) => {
          return {
            label: mailbox.displayName || 'Untitled',
            type: 'radio',
            checked: mailbox.id === (activeMailbox || {}).id,
            click: () => { this._selectors.changeMailbox(mailbox.id) },
            accelerator: this.buildAcceleratorStringForIndex(accelerators.mailboxIndex, index)
          }
        }))
        .concat(activeMailbox && activeMailbox.hasAdditionalServices ? [{ type: 'separator' }] : [])
        .concat(activeMailbox && activeMailbox.hasAdditionalServices ? activeMailbox.enabledServices.map((service, index) => {
          return {
            label: service.humanizedType,
            type: 'radio',
            checked: service.type === activeServiceType,
            click: () => { this._selectors.changeMailbox(activeMailbox.id, service.type) },
            accelerator: this.buildAcceleratorStringForIndex(accelerators.serviceIndex, index)
          }
        }) : [])
      },
      {
        label: 'Help',
        role: 'help',
        submenu: [
          { label: 'Wavebox Website', click: this._selectors.learnMore },
          { label: 'Privacy', click: this._selectors.privacy },
          { label: 'Wavebox on GitHub', click: this._selectors.learnMoreGithub },
          { label: 'Report a Bug', click: this._selectors.bugReport }
        ]
      }
    ])
  }

  /**
  * Builds an accelerator string from a descriptor but with a rolling index value
  * @param accelerator: the accelerator descriptor to use
  * @param index: the index of the item to use in an array. This will be +1'ed and top & tailed
  * @return a string that can be used with electron
  */
  buildAcceleratorStringForIndex (accelerator, index) {
    if (index < 0 || index > 9) {
      return undefined
    } else {
      return (accelerator || '').replace('Number', index + 1)
    }
  }

  /**
  * Builds and applies the mailboxes menu
  * @param accelerators: the accelerators to use
  * @param mailboxes: the current list of mailboxes
  * @param activeMailbox: the active mailbox
  * @param activeServiceType: the type of active service
  */
  updateApplicationMenu (accelerators, mailboxes, activeMailbox, activeServiceType) {
    this._lastAccelerators = accelerators
    this._lastActiveMailbox = activeMailbox
    this._lastActiveServiceType = activeServiceType
    this._lastMailboxes = mailboxes

    const lastMenu = this._lastMenu
    this._lastMenu = this.build(accelerators, mailboxes, activeMailbox, activeServiceType)
    Menu.setApplicationMenu(this._lastMenu)
    this.updateHiddenShortcuts(accelerators)

    // Prevent Memory leak
    if (lastMenu) {
      MenuTool.fullDestroyMenu(lastMenu)
    }
  }

  /**
  * Updates the hidden shortcuts
  * @param accelerators: the accelerators to use
  */
  updateHiddenShortcuts (accelerators) {
    const hiddenZoomInShortcut = process.platform === 'darwin' ? 'Cmd+=' : 'Ctrl+='
    if (accelerators.zoomIn === accelerators.zoomInDefault) {
      if (!electronLocalshortcut.isRegistered(hiddenZoomInShortcut)) {
        electronLocalshortcut.register(hiddenZoomInShortcut, this._selectors.zoomIn)
      }
    } else {
      if (electronLocalshortcut.isRegistered(hiddenZoomInShortcut)) {
        electronLocalshortcut.unregister(hiddenZoomInShortcut)
      }
    }
  }

  /* ****************************************************************************/
  // Change events
  /* ****************************************************************************/

  /**
  * Handles the mailboxes changing
  */
  handleMailboxesChanged () {
    const activeMailbox = mailboxStore.getActiveMailbox()
    const activeServiceType = mailboxStore.getActiveServiceType()
    const mailboxes = mailboxStore.orderedMailboxes()

    // Munge our states for easier comparison
    const props = [
      [(this._lastActiveMailbox || {}).id, (activeMailbox || {}).id],
      [this._lastActiveServiceType, activeServiceType],
      [
        (this._lastMailboxes || []).map((m) => m.displayName + ';' + m.enabledServiceTypes.join(';')).join('|'),
        mailboxes.map((m) => m.displayName + ';' + m.enabledServiceTypes.join(';')).join('|')
      ]
    ]

    // Check for change
    const changed = props.findIndex(([prev, next]) => prev !== next) !== -1
    if (changed) {
      this.updateApplicationMenu(this._lastAccelerators, mailboxes, activeMailbox, activeServiceType)
    }
  }

  /**
  * Handles the accelerators changing. If these change it will definately have a reflection in the
  * menu, so just update immediately
  */
  handleAcceleratorsChanged ({ next }) {
    this.updateApplicationMenu(next, this._lastMailboxes, this._lastActiveMailbox, this._lastActiveServiceType)
  }
}

module.exports = AppPrimaryMenu
