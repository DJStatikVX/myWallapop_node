module.exports = function(app, swig, gestorBD) {

    /**
     * Página principal de la aplicación web
     */
    app.get("/inicio", function(req, res, next) {
        let criterio = { "promocionada" : true };
        let pg = parseInt(req.query.pg);
        if (req.query.pg == null) {
            pg = 1;
        }

        // Se obtienen las ofertas promocionadas para mostrarlas en el inicio
        gestorBD.obtenerOfertasPg(criterio, pg,function (ofertas, total) {
           if (ofertas == null) {
               next(new Error("Se ha producido un error cargando las ofertas promocionadas."));
           } else {
               // Paginación de ofertas destacadas
               let ultimaPg = total / 5;
               if (total % 5 > 0 ) { // Sobran decimales
                   ultimaPg = ultimaPg + 1;
               }
               let paginas = []; // paginas mostrar
               for(let i = pg - 2; i <= pg + 2; i++){
                   if (i > 0 && i <= ultimaPg) {
                       paginas.push(i);
                   }
               }

               // Renderizamos la vista
               let respuesta = swig.renderFile('views/binicio.html', {
                   usuario : req.session.usuario,
                   ofertas : ofertas,
                   paginas : paginas,
                   actual : pg,
               });
               res.send(respuesta);
           }
        });

        // Registramos petición en Logger
        let stringUsuario = req.session.usuario ? req.session.usuario.email : "Alguien";
        app.get('logger').info(stringUsuario + " ha accedido a la página principal");
    });

    /**
     * Petición para obtener vista de inicio de sesión
     */
    app.get("/identificarse", function(req, res) {
        app.get('logger').info("Alguien ha accedido al inicio de sesión");
        let respuesta = swig.renderFile('views/bidentificacion.html', {});
        res.send(respuesta);
    });

    /**
     * Petición POST para autenticar a un usuario
     */
    app.post("/identificarse", function(req, res) {
        // Encriptamos su contraseña
        let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
            .update(req.body.password).digest('hex');
        let criterio = {
            email : req.body.email,
            password : seguro
        }

        // Buscamos al usuario en BD
        gestorBD.obtenerUsuarios(criterio, function(usuarios) {
            // Si hay error o no existe
            if (usuarios == null || usuarios.length === 0) {
                req.session.usuario = null;
                res.redirect("/identificarse" +
                    "?mensaje=Email o password incorrecto"+
                    "&tipoMensaje=alert-danger ");
            } else {
                // Se registra en sesión y se redirige al inicio
                req.session.usuario = usuarios[0];
                app.get('logger').info(usuarios[0].email + " ha iniciado sesión en la aplicación web");
                res.redirect("/inicio");
            }
        });
    });

    /**
     * Petición para obtener vista de registro
     */
    app.get("/registrarse", function(req, res) {
        app.get('logger').info("Alguien ha accedido al formulario de registro");
        let respuesta = swig.renderFile('views/bregistro.html', {});
        res.send(respuesta);
    });

    /**
     * Petición para cerrar la sesión
     */
    app.get("/salir", function(req, res) {
        app.get('logger').info(req.session.usuario.email + " ha accedido al inicio de sesión");
        // Eliminamos el usuario en sesión y se vuelve al login
        req.session.usuario = null;
        res.redirect("/identificarse");
    });

    /**
     * Petición POST para registrar a un nuevo usuario
     */
    app.post('/registrarse', function(req, res, next) {
        // Encriptación de contraseña
        let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
            .update(req.body.password).digest('hex');

        // Encriptación de contraseña repetida
        let repSeguro = app.get("crypto").createHmac('sha256', app.get('clave'))
            .update(req.body.passwordConfirm).digest('hex');

        // Validamos campos
        if (!camposValidos(req.body)) {
            res.redirect("/registrarse?mensaje=Debes rellenar todos los campos.&tipoMensaje=alert-danger");
            return;
        }

        // Validamos dirección de correo electrónico
        if (!emailValido(req.body.email)) {
            res.redirect("/registrarse?mensaje=Introduce una dirección de correo electrónico válida. "
                        + "Por ejemplo: pedro@email.com&tipoMensaje=alert-danger");
            return;
        }

        // Deben coincidir las contraseñas
        if (seguro === repSeguro) {
            let criterio = { email : req.body.email };
            existeUsuario(criterio, function(result) {
                if (!result) {
                    // Datos del nuevo usuario
                    let usuario = {
                        email: req.body.email,
                        nombre: req.body.name,
                        apellidos: req.body.surname,
                        password: seguro,
                        saldo: 100.00,
                        perfil: "Usuario Estándar"
                    };

                    // Damos de alta al usuario en BD
                    gestorBD.insertarUsuario(usuario, function (id) {
                        if (id == null) {
                            next(new Error("Se ha producido un error en el registro."));
                        } else {
                            app.get('logger').info("Nuevo usuario " + usuario.email + " registrado con éxito");
                            res.redirect("/identificarse?mensaje=Usuario registrado con éxito.&tipoMensaje=alert-success");
                        }
                    });
                } else {
                    res.redirect("/registrarse?mensaje=Lo sentimos, el usuario especificado ya existe.&tipoMensaje=alert-danger");
                    return;
                }
            });
            // Error si no coinciden las contraseñas
        } else {
            res.redirect("/registrarse?mensaje=Las contraseñas no coinciden&tipoMensaje=alert-danger");
            return;
        }
    });

    /**
     * [Admin] Petición para obtener la lista de usuarios en el sistema
     */
    app.get("/usuario/lista", function(req, res, next) {
        // Recuperar todos los usuarios menos el Administrador
        let criterio = { email: { $not: { $eq: "admin@email.com" } } };

        // Consulta de datos
        gestorBD.obtenerUsuarios(criterio, function(usuarios) {
            if (usuarios == null) {
                next(new Error("Se ha producido un error recuperando la lista de usuarios."))
            } else {
                app.get('logger').info("El usuario " + req.session.usuario.email + " ha accedido a la lista de usuarios");
                let respuesta = swig.renderFile('views/busuarios.html', {
                    usuario : req.session.usuario,
                    usuarios : usuarios
                });
                res.send(respuesta);
            }
        });
    });

    /**
     * [Admin] Petición POST para eliminar uno o más usuarios
     */
    app.post("/usuario/eliminar", function(req, res, next) {
        // Recuperar los usuarios seleccionados
        let seleccion = req.body.checkboxEliminar;
        let exito = true;

        let control = 0
        // Para cada usuario, llamar a ser eliminado en BD (y sus ofertas en cascada)
        if (Array.isArray(seleccion)) {
            for (let i = 0; i < seleccion.length; i++) {
                borrarUsuario(seleccion[i], next, function (result){
                    if(result){
                        control++;
                        app.get('logger').info(req.session.usuario.email + " ha eliminado a usuario: " + seleccion[i]);
                        if(control === seleccion.length){
                            res.redirect("/usuario/lista?mensaje=Usuario(s) eliminado(s) con éxito.&tipoMensaje=alert-success");
                        }
                    }
                });
            }
        } else {
            borrarUsuario(seleccion, next, function(result){
                if(result){
                    app.get('logger').info(req.session.usuario.email + " ha eliminado a usuario: " + seleccion);
                    res.redirect("/usuario/lista?mensaje=Usuario(s) eliminado(s) con éxito.&tipoMensaje=alert-success");
                }
            });
        }

    });

    /**
     * Borra un usuario e indica si lo ha hecho con éxito o no
     * @param usuario email del usuario a eliminar
     * @param next objeto en caso de querer mostrar un error
     * @param funcionCallback
     */
    function borrarUsuario(usuario, next, funcionCallback) {
        let criterio = { email: usuario };
        // Se elimina al usuario
        gestorBD.eliminarUsuario(criterio, function (result) {
            if (result == null) {
                next(new Error("Se ha producido un error eliminando al usuario " + usuario + "."));
                funcionCallback(false)
            } else {
                // Y se eliminan sus ofertas en cascada
                let criterioOfertas = { vendedor: usuario };
                gestorBD.eliminarOferta(criterioOfertas, function (finalResult) {
                    if (finalResult == null) {
                        next(new Error("Se ha producido un error eliminando las ofertas del usuario "
                            + usuario + "."));
                        funcionCallback(false)
                    }
                    else{
                        funcionCallback(true);
                    }
                });
            }
        });
    }

    /**
     * Función que devuelve si un usuario ya está dado de alta
     * @param usuario dirección de correo electrónico a comprobar
     * @param funcionCallback retorno (true o false)
     */
    function existeUsuario(usuario, funcionCallback) {
        gestorBD.obtenerUsuarios(usuario, function(usuarios) {
            if (usuarios == null || usuarios.length > 0) {
                funcionCallback(true);
            } else {
                funcionCallback(false);
            }
        });
    }

    /**
     * Función que valida los campos
     * @param campos cuerpo de la petición
     * @returns {boolean} false si falla alguno de los campos; true en caso contrario
     */
    function camposValidos(campos) {
        if (campos.email == null || campos.email.trim().length === 0) {
            return false;
        }

        if (campos.name == null || campos.name.trim().length === 0) {
            return false;
        }

        if (campos.surname == null || campos.surname.trim().length === 0) {
            return false;
        }

        if (campos.password == null || campos.password.trim().length === 0) {
            return false;
        }

        return !(campos.passwordConfirm == null || campos.passwordConfirm.trim().length === 0);
    }

    /**
     * Comprueba mediante una RegExp que una dirección de correo electrónico sea válida
     * @param email dirección a comprobar
     * @returns {boolean} true si hay match con la RegExp; false en caso contrario
     */
    function emailValido(email) {
        let regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return regex.test(String(email).toLowerCase());
    }

}