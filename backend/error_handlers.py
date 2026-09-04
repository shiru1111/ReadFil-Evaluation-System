from flask import jsonify

def register_error_handlers(app):
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "error": "Bad Request",
            "message": str(error),
            "status_code": 400
        }), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({
            "error": "Unauthorized",
            "message": "Authentication is required to access this resource.",
            "status_code": 401
        }), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({
            "error": "Forbidden",
            "message": "You do not have permission to access this resource.",
            "status_code": 403
        }), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "error": "Not Found",
            "message": "The requested API endpoint was not found on this server.",
            "status_code": 404
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({
            "error": "Method Not Allowed",
            "message": "The method is not allowed for the requested URL.",
            "status_code": 405
        }), 405

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "error": "Payload Too Large",
            "message": "The uploaded file or payload exceeds the maximum allowed size.",
            "status_code": 413
        }), 413

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred on the server.",
            "status_code": 500
        }), 500

    @app.errorhandler(502)
    def bad_gateway(error):
        return jsonify({
            "error": "Bad Gateway",
            "message": "The server received an invalid response from an upstream server.",
            "status_code": 502
        }), 502
        
    @app.errorhandler(503)
    def service_unavailable(error):
        return jsonify({
            "error": "Service Unavailable",
            "message": "The server is temporarily unable to handle the request. Please try again later.",
            "status_code": 503
        }), 503

    @app.errorhandler(505)
    def http_version_not_supported(error):
        return jsonify({
            "error": "HTTP Version Not Supported",
            "message": "The server does not support the HTTP protocol version used in the request.",
            "status_code": 505
        }), 505
