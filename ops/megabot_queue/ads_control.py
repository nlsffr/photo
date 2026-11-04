"""Fixed advertising CLI relay for the existing private root controller.

No database credentials, socket client, shell or browser dependency lives here.
The application CLI owns authorization, configuration CAS and its DB audit.
"""
import datetime as dt
import json
import subprocess

PLACEMENTS = frozenset(('header', 'footer', 'underVideo', 'feed', 'popunder', 'interstitial', 'slider'))
ERRORS = {'conflict': 409, 'not_ready': 400, 'invalid_request': 400, 'unavailable': 503}
COMMAND = ('docker', 'exec', '-i', 'photo-app-1', 'node', '/app/ops/ads-control.mjs')


class AdsControlError(RuntimeError):
    def __init__(self, code='unavailable', status=503):
        self.code = code
        self.status = status
        super().__init__(code)


def valid_revision(value):
    return type(value) is int and 0 <= value <= 4294967294


def validate_request(value):
    if isinstance(value, dict):
        if value == {'action': 'get'}:
            return value
        if (set(value) == {'action', 'enabled', 'revision'} and value['action'] == 'set'
                and type(value['enabled']) is bool and valid_revision(value['revision'])):
            return value
    raise AdsControlError('invalid_request', 400)


def validate_response(value):
    if not isinstance(value, dict):
        raise AdsControlError()
    if value.get('ok') is False:
        code = value.get('error')
        raise AdsControlError(code if code in ERRORS else 'unavailable', ERRORS.get(code, 503))
    config = value.get('config')
    if (set(value) != {'ok', 'config', 'ready', 'missing'} or value['ok'] is not True
            or not isinstance(config, dict) or set(config) != {'enabled', 'revision', 'placements', 'updatedAt'}
            or type(config['enabled']) is not bool or not valid_revision(config['revision'])
            or not isinstance(config['placements'], dict) or set(config['placements']) != PLACEMENTS
            or any(type(flag) is not bool for flag in config['placements'].values())
            or type(value['ready']) is not bool or not isinstance(value['missing'], list)
            or len(value['missing']) > len(PLACEMENTS)
            or any(type(key) is not str or key not in PLACEMENTS for key in value['missing'])):
        raise AdsControlError()
    stamp = config['updatedAt']
    if stamp is not None:
        if not isinstance(stamp, str) or len(stamp) > 40:
            raise AdsControlError()
        try:
            if dt.datetime.fromisoformat(stamp.replace('Z', '+00:00')).tzinfo is None:
                raise ValueError()
        except ValueError:
            raise AdsControlError() from None
    return value


def request(payload):
    validate_request(payload)
    try:
        result = subprocess.run(list(COMMAND), input=json.dumps(payload), text=True,
                                capture_output=True, timeout=8)
        if not isinstance(result.stdout, str) or len(result.stdout.encode('utf-8')) > 16384:
            raise AdsControlError()
        value = validate_response(json.loads(result.stdout))
        if result.returncode != 0:
            raise AdsControlError()
        return value
    except AdsControlError:
        raise
    except (OSError, ValueError, TypeError, UnicodeError, subprocess.SubprocessError):
        raise AdsControlError() from None
