from agents.basic_agent import agent


def test_agent_response():
    result = agent.invoke({
        "message": "Hello AI",
        "response": "",
    })

    assert result["response"] == "AI Agent received: Hello AI"


def test_agent_empty_message():
    result = agent.invoke({
        "message": "",
        "response": "",
    })

    assert result["response"] == "AI Agent received: "
