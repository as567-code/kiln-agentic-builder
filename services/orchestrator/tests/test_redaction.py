from kiln_orchestrator.redaction import redact


def test_redacts_common_secret_shapes() -> None:
    result = redact(
        "Authorization: Bearer top-secret api_key=abc123 password=hunter2 sk-exampletoken12345"
    )
    assert "top-secret" not in result
    assert "abc123" not in result
    assert "hunter2" not in result
    assert "sk-exampletoken12345" not in result
    assert result.count("[REDACTED]") >= 4
