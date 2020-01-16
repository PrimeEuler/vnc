var fs          = require('fs');
var crypto      = require('crypto');
var events      = require('events');
var express     = require('express');
var io          = require('socket.io');
var rfb         = require('rfb2');
var Png         = require('pngjs').PNG;

function rfbsocket(){
    var self    = new events.EventEmitter()
    var pki     = {
        privateKey: fs.readFileSync(__dirname + '/crypto/host.key'),
        key:        fs.readFileSync(__dirname + '/crypto/host.key'),
        cert:       fs.readFileSync(__dirname + '/crypto/host.crt'),
        passphrase: 'password'
    }
    var api     = express();
    var server  = require('https').createServer(pki , api);
        api.use(express.static(__dirname + '/web/'));
        api.get('/', function (req, res) {
            res.sendFile(__dirname + '/web/index.html');
        });
        io(server).on('connection', function(socket,options){
            var r   = rfb.createConnection({
                    host: '127.0.0.1',
                    port: 5901,
                    password: 'testvnc',
                    securityType: 'vnc'
                });
            function encodeFrame(rect) {
                var png = new Png({
                    width: rect.width,
                    height: rect.height,
                    filterType: -1
                });
                for (var y = 0; y < png.height; y++) {
                    for (var x = 0; x < png.width; x++) {
                        var idx = (png.width * y + x) << 2;// bitwise * 4 (grgb)
                        png.data[idx+0] = rect.data[idx+2] //R
                        png.data[idx+1] = rect.data[idx+1] //G
                        png.data[idx+2] = rect.data[idx+0] //B
                        png.data[idx+3] = 255              //A
                    }
                }
                
                return Png.sync.write(png,{ colorType: 6 })
            }
            r.on('connect', function() {
                var info = { title: r.title, width:r.width, height:r.height }
                    socket.emit('init', info )
                    console.log( info )
                    socket.interval = setInterval( function () {
                        r.requestUpdate(true, 0, 0, r.width, r.height);
                    }, 1000/10)
            });
            r.on('rect', function(rect) {
                switch(rect.encoding) {
                    case rfb.encodings.raw:
                        // rect.x, rect.y, rect.width, rect.height, rect.data
                        // pixmap format is in r.bpp, r.depth, r.redMask, greenMask, blueMask, redShift, greenShift, blueShift
                        //print( encodeFrame(rect).toString('base64') )
                        socket.emit('rect', {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            image: encodeFrame(rect).toString('base64')
                        });
                        break;
                    case rfb.encodings.copyRect:
                        // pseudo-rectangle
                        // copy rectangle from rect.src.x, rect.src.y, rect.width, rect.height, to rect.x, rect.y
                        break;
                    case rfb.encodings.hextile:
                        // not fully implemented
                        //rect.on('tile', handleHextileTile); // emitted for each subtile
                        break;
                }
            });
            r.on('resize', function(rect) {
                console.log('window size has been resized! Width: %s, Height: %s', rect.width, rect.height);
            });
            r.on('clipboard', function(newPasteBufData) {
                console.log('remote clipboard updated!', newPasteBufData);
            });
            r.on('bell', console.log);
            r.on('error', function(e){
                console.log(e)
                clearInterval(s.interval)
                socket.end()
                r.end()
            });
            r.on('*', console.log);
            r.stream.on('end',function(){
                clearInterval(s.interval)
                socket.end()
                r.end()
            })
            socket.on('pointerEvent', function (e) {
                r.pointerEvent(e.x, e.y, e.buttons);
            });
            socket.on('keyEvent', function (e) {
                r.keyEvent(e.keyCode, e.isDown);
            });
            socket.on('end', function () {
                console.log('session ended.')
                clearInterval(socket.interval)
                r.end()
            });
            socket.on('close', function () {
                console.log('session closed.')
                clearInterval(socket.interval)
                r.end()
            });
        })
        return server
}


var vnc = new rfbsocket()
    vnc.listen( 8901, function(){ console.log( this.address() ) } )
