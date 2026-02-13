import AppKit

let app = NSApplication.shared
let delegate = SYNCWidgetAppDelegate()
app.delegate = delegate
app.setActivationPolicy(.prohibited)  // Never become active app — prevents Stage Manager triggering
app.run()
