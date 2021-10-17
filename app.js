// Módulos
let express = require('express');
let app = express();

// Logger
let log4js = require('log4js');
log4js.configure({
    appenders: { actividad: { type: "file", filename: "actividad.log" } },
    categories: { default: { appenders: ["actividad"], level: "info" } }
});

let logger = log4js.getLogger("actividad");
app.set('logger', logger);

// API REST
let rest = require('request');
app.set('rest', rest);

// Cabeceras para conexión con cliente ligero jQuery/AJAX
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "POST, GET, DELETE, UPDATE, PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, token");
    // Debemos especificar todas las headers que se aceptan. Content-Type, token
    next();
});

// JSONWebToken para tratar los tokens de autenticación
let jwt = require('jsonwebtoken');
app.set('jwt', jwt);

// Gestión de la sesión de usuario
let expressSession = require('express-session');
app.use(expressSession({
    secret: 'abcdefg',
    resave: true,
    saveUninitialized: true
}));

// Módulos para manejar peticiones (encriptación, persistencia, plantillas, POST...)
let crypto = require('crypto');
let mongo = require('mongodb');
let swig = require('swig');
let bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Base de datos
let gestorBD = require("./modules/gestorBD.js");
gestorBD.init(app, mongo);

// Recursos estáticos (imágenes)
app.use(express.static('public'));

// Variables
app.set('port', 8081);
app.set('db', 'your_key');
app.set('clave', 'abcdefg');
app.set('crypto', crypto);

// Ruta raíz
app.get("/", function(req, res, next) {
   res.redirect("/inicio");
});

// routerUsuarioSession, redirige a usuarios no autenticados
let routerUsuarioSession = express.Router();
routerUsuarioSession.use(function(req, res, next) {
   req.session.usuario ? next() : res.redirect("/identificarse");
});

// Aplicar routerUsuarioSession
app.use("/salir", routerUsuarioSession);
app.use("/usuario/lista", routerUsuarioSession);
app.use("/usuario/eliminar", routerUsuarioSession);
app.use("/oferta/propias", routerUsuarioSession);
app.use("/oferta/agregar", routerUsuarioSession);
app.use("/oferta/comprar", routerUsuarioSession);
app.use("/oferta/eliminar*", routerUsuarioSession);
app.use("/oferta/compradas", routerUsuarioSession);
app.use("/oferta/promocionar/*", routerUsuarioSession);

// routerUsuarioNoSession, evita poder loguearse más de una vez
let routerUsuarioNoSession = express.Router();
routerUsuarioNoSession.use(function(req, res, next) {
    req.session.usuario ? res.redirect("/inicio") : next();
});

// Aplicar routerUsuarioNoSession
app.use("/identificarse", routerUsuarioNoSession);
app.use("/registrarse", routerUsuarioNoSession);

// routerUsuarioAdministrador, comprueba que solo un Administrador pueda acceder
let routerUsuarioAdministrador = express.Router();
routerUsuarioAdministrador.use(function(req, res, next) {
    if ( req.session.usuario && req.session.usuario.perfil === "Administrador" ) {
        // dejamos correr la petición
        next();
    }
    else if(req.session.usuario){
        logger.error(req.session.usuario.email
            + " ha intentado acceder a una opción de Administrador (" + req.baseUrl + ")");
        res.status(400);
        let respuesta = swig.renderFile('views/error.html',
            {
                mensaje: "Recurso no disponible.",
                tipoMensaje: "alert-danger"
            });
        res.send(respuesta);
    }
});

// Aplicar routerUsuarioAdministrador
app.use("/usuario/lista", routerUsuarioAdministrador);
app.use("/usuario/eliminar", routerUsuarioAdministrador);

// routerUsuarioEstandar, comprueba que solo un Usuario Estándar pueda acceder
let routerUsuarioEstandar = express.Router();
routerUsuarioEstandar.use(function(req, res, next) {
    if ( req.session.usuario && req.session.usuario.perfil !== "Administrador" ) {
        // dejamos correr la petición
        next();
    }
    else if(req.session.usuario){
        logger.error(req.session.usuario.email + " (Administrador) ha intentado comprar una oferta");
        next(new Error("El administrador no puede comprar"));
    }
});

//Aplicar routerUsuarioEstandar
app.use("/oferta/propias",routerUsuarioEstandar);
app.use("/oferta/agregar",routerUsuarioEstandar);
app.use("/oferta/comprar",routerUsuarioEstandar);
app.use("/oferta/eliminar*",routerUsuarioEstandar);
app.use("/oferta/compradas",routerUsuarioEstandar);
app.use("/oferta/promocionar/*", routerUsuarioEstandar);

// routerUsuarioToken para servicios REST
let routerUsuarioToken = express.Router();
routerUsuarioToken.use(function(req, res, next) {
    // obtener el token, vía headers (opcionalmente GET y/o POST).
    let token = req.headers['token'] || req.body.token || req.query.token;
    if (token != null) {
        // verificar el token
        jwt.verify(token, 'secreto', function(err, infoToken) {
            if (err || (Date.now()/1000 - infoToken.tiempo) > 240 ){
                res.status(403); // Forbidden
                res.json({
                    acceso : false,
                    error: 'Token invalido o caducado'
                });
            } else {
                // dejamos correr la petición
                res.usuario = infoToken.usuario;
                next();
            }
        });
    } else {
        res.status(403); // Forbidden
        res.json({
            acceso : false,
            mensaje: 'No hay Token'
        });
    }
});

// Aplicar routerUsuarioToken
app.use('/api/ofertas', routerUsuarioToken);
app.use('/api/mensaje/*', routerUsuarioToken);
app.use('/api/conversacion/*', routerUsuarioToken);

// Rutas/controladores por lógica
require("./routes/rusuarios")(app, swig, gestorBD);
require("./routes/rofertas")(app, swig, gestorBD);
require("./routes/rapiusuarios")(app, gestorBD);
require("./routes/rapiofertas")(app, gestorBD);
require("./routes/rapiconversaciones")(app, gestorBD);

// Rutas/controladores de pruebas
require("./routes/rpruebas")(app, gestorBD);

// Router de errores (muestra errores en una vista personalizada)
app.use(function(err, req, res, next) {
    logger.error(err); // registramos el error producido
    if (!res.headersSent) {
        res.status(400);
        let respuesta = swig.renderFile('views/error.html',
            {
                mensaje: err.message,
                tipoMensaje: "alert-danger"
            });
        res.send(respuesta);
    }
});

// Escuchar por el puerto 80
app.listen(app.get('port'), function() {
    console.log("Servidor activo");
});