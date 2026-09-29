const { mayNavigate } = require('./pageUrls')

function keepToShellPages(contents, appLocation, openLink) {
  let firstLoadUrl = ''
  contents.setWindowOpenHandler(({ url }) => {
    openLink(url)
    return { action: 'deny' }
  })
  contents.on('did-start-navigation', (event) => {
    if (!firstLoadUrl && event.isMainFrame && !event.isSameDocument) firstLoadUrl = event.url
  })
  contents.on('will-navigate', (event) => {
    if (!mayNavigate(contents.getURL(), event.url, appLocation)) event.preventDefault()
  })
  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame) return
    const page = contents.getURL() || firstLoadUrl
    if (!mayNavigate(page, event.url, appLocation)) event.preventDefault()
  })
}

module.exports = { keepToShellPages }
