var fs = require('fs')
var split = require('split')
var eos = require('end-of-stream')
var through = require('through2')

function Node (name) {
  this.name = name
  this.value = 0
  this.children = {}
}

Node.prototype.add = function (frames, value) {
  this.value += value
  if (frames && frames.length > 0) {
    var head = frames[0]
    var child = this.children[head]
    if (!child) {
      child = new Node(head)
      this.children[head] = child
    }
    frames.splice(0, 1)
    child.add(frames, value)
  }
}

Node.prototype.serialize = function () {
  var res = {
    'name': this.name,
    'value': this.value
  }

  var children = []

  for (var key in this.children) {
    children.push(this.children[key].serialize())
  }

  if (children.length > 0) res.children = children

  return res
}

function Profile () {
  this.samples = new Node('root')
  this.stack = null
  this.name = null
}

Profile.prototype.openStack = function (name) {
  this.stack = []
  this.name = name
}

Profile.prototype.addFrame = function (frame) {
  if (!this.stack) this.stack = []
  frame = frame.replace(/^\s+/, '').replace(/\s+$/, '')
  if (!frame.length) return

  this.stack.unshift(
    frame
      .replace(/^\w+ /, '')
      .replace(/ \(\S+\)$/, '')
      .replace(/(..)[(<].*/, '$1')
  )
}

Profile.prototype.closeStack = function () {
  this.stack.unshift(this.name)
  this.samples.add(this.stack, 1)
  this.stack = []
  this.name = null
}

function stream () {
  var stackOpenRx = /(.+):(.+):$/
  var frameRx = /^\s*(\w+)\s*(.+) \((\S*)\)?/g
  var stackCloseRx = /^$/g
  var commentRx = /^#/g
  var profile = new Profile()

  var s = through(function (line, enc, cb) {
    if (commentRx.exec(line)) return cb()
    var matches = stackOpenRx.exec(line)
    if (matches) {
      profile.openStack(matches[2].trim())
      return cb()
    }

    matches = stackCloseRx.exec(line)
    if (matches) {
      profile.closeStack()
      return cb()
    }

    profile.addFrame(line+'')

    cb()
  })

  s.profile = profile

  return s
}


module.exports = function convert (cb) {
  var s = stream()

  eos(s, function () {
    cb(null, s.profile.samples.serialize())
  })

  return s

}